from __future__ import annotations

import copy
import re
import typing

from odoo.tools import SQL

if typing.TYPE_CHECKING:
    from collections.abc import Callable, Iterable
    from odoo.tools import Query

    from .fields import Field
    from .models import BaseModel

SQL_EMPTY = SQL()
SQL_ASC = SQL("ASC")
SQL_DESC = SQL("DESC")
SQL_NULLS_FIRST = SQL("NULLS FIRST")
SQL_NULLS_LAST = SQL("NULLS LAST")


order_re = re.compile(r'^(.*?)(?:\s+(asc|desc))?(?:\s+nulls\s+(first|last))?$', re.IGNORECASE)
aggregate_re = re.compile(r'^(\w+)\((.+)\)$')
field_split_re = re.compile(r'[\.:]')


# valid SQL aggregation functions
READ_GROUP_AGGREGATE = {
    'sum': lambda table, expr: SQL('SUM(%s)', expr),
    'avg': lambda table, expr: SQL('AVG(%s)', expr),
    'max': lambda table, expr: SQL('MAX(%s)', expr),
    'min': lambda table, expr: SQL('MIN(%s)', expr),
    'bool_and': lambda table, expr: SQL('BOOL_AND(%s)', expr),
    'bool_or': lambda table, expr: SQL('BOOL_OR(%s)', expr),
    'array_agg': lambda table, expr: SQL('ARRAY_AGG(%s ORDER BY %s)', expr, SQL.identifier(table, 'id')),
    'array_agg_distinct': lambda table, expr: SQL('ARRAY_AGG(DISTINCT %s ORDER BY %s)', expr, expr),
    # 'recordset' aggregates will be post-processed to become recordsets
    'recordset': lambda table, expr: SQL('ARRAY_AGG(%s ORDER BY %s)', expr, SQL.identifier(table, 'id')),
    'count': lambda table, expr: SQL('COUNT(%s)', expr),
    'count_distinct': lambda table, expr: SQL('COUNT(DISTINCT %s)', expr),
    '__count': lambda table, expr: SQL('COUNT(*)'),
}


class FieldExpression:
    def __init__(self, spec: str | tuple[str, ...], *, check2one=False) -> None:
        if not spec:
            raise ValueError("Invalid empty field expression")
        if isinstance(spec, tuple):
            self.path = spec
        else:
            self.path: tuple[str, ...] = tuple(field_split_re.split(spec))
        if not all(self.path):
            raise ValueError(f"Invalid field expression {spec!r}")
        self.check2one = check2one

    def field(self, model: BaseModel) -> Field:
        if field := model._fields.get(self.path[0]):
            return field
        raise ValueError(f"Invalid field {self.path[0]!r} on model {model._name!r}")

    @property
    def is_single_field(self) -> bool:
        return len(self.path) == 1

    @property
    def field_name(self) -> str:
        return self.path[0]

    @property
    def property_name(self) -> str | None:
        return '.'.join(self.path[1:]) or None

    def traverse(self, model: BaseModel) -> tuple[list[tuple[Field, BaseModel]], FieldExpression]:
        # traverse to a related field and return the final expression
        if self.is_single_field:
            return [], self
        path = []
        last = len(self.path) - 1
        for index, field_name in enumerate(self.path):
            field = model._fields[field_name]
            if index == last:
                break
            if not field.relational:
                # this can be a property
                break
            if self.check2one and field.type != 'many2one':
                raise ValueError(f"Accepting only many2one in the field path, got {field.name} in {self}")
            model = model.env[field.comodel_name]
            path.append((field, model))
        return path, FieldExpression(self.path[index:])

    def _getters(self, model: BaseModel) -> Iterable[Callable[[BaseModel], typing.Any]]:
        path, last_expr = self.traverse(model)
        for field, comodel in path:
            yield field.__get__
            model = comodel
        field = last_expr.field(model)
        # XXX if last_expr.is_single_field
        yield field.__get__

    def getter(self, model: BaseModel) -> Callable[[BaseModel], typing.Any]:
        getters = list(self._getters(model))
        getter = getters[-1]

        def call_chain(a, b):
            return lambda value: a(b(value))
        for path_access in reversed(getters[:-1]):
            getter = call_chain(path_access, getter)
        return getter

    def __repr__(self) -> str:
        return f"FieldExpression{self.path}"

    def __str__(self) -> str:
        return '.'.join(self.path)


class AggregateExpression:
    def __init__(self, spec: str, *, model: BaseModel | None = None) -> None:
        self._alias = ''
        if spec == '__count':
            self.field_expr = None
            self.aggregate = spec
            return
        function_spec, _, aggregate = spec.partition(':')
        if match := aggregate_re.fullmatch(aggregate):
            # aggregate with alias
            self._alias = function_spec
            aggregate, function_spec = match[1], match[2]
        self.field_expr = FieldExpression(function_spec)
        if model is not None:
            field = self.field_expr.field(model)
            if not aggregate:
                aggregate = field.aggregator
        self.aggregate = aggregate
        if self.aggregate not in READ_GROUP_AGGREGATE:
            raise ValueError(f"Invalid aggregate method {aggregate!r} for {self!r}.")

    @property
    def alias(self) -> str:
        return self._alias or str(self)

    def _to_sql(self, model: BaseModel, query: Query) -> SQL:
        if self.field_expr is None:
            sql_field = SQL()
        else:
            sql_field = model._field_to_sql(model._table, str(self.field_expr), query)
        try:
            return READ_GROUP_AGGREGATE[self.aggregate](model._table, sql_field)
        except KeyError:
            raise ValueError(f"Invalid aggregate method {self.aggregate!r} for {self!r}.")

    def __repr__(self) -> str:
        str_field = str(self.field_expr)
        agg_name = self.aggregate or "''"
        return f"AggregateExpression({agg_name}({str_field!r}))"

    def __str__(self) -> str:
        if self.field_expr is None:
            return self.aggregate
        return f"{self.field_expr}:{self.aggregate}"


class OrderExpression:
    def __init__(self, spec: str) -> None:
        match = order_re.match(spec)
        if not match:
            raise ValueError(f"Invalid order specification {spec!r}")
        self.field_expr = FieldExpression(match[1])
        self.asc = str(match[2]).lower() != 'desc'
        self.nulls = str(match[3]).lower() if match[3] else None

    def reversed(self) -> OrderExpression:
        e = copy.copy(self)
        e.asc = not e.asc
        if e.nulls == 'first':
            e.nulls = 'last'
        if e.nulls == 'last':
            e.nulls = 'first'
        return e

    @property
    def sql_direction(self) -> SQL:
        # XXX return empty instead of ASC to avoid updating tests
        return SQL_EMPTY if self.asc else SQL_DESC

    @property
    def sql_nulls(self) -> SQL:
        match self.nulls:
            case 'first':
                return SQL_NULLS_FIRST
            case 'last':
                return SQL_NULLS_LAST
        return SQL_EMPTY

    def _to_sql(self, model: BaseModel, alias: str, query: Query, *, sql_expr: SQL | None = None) -> SQL:
        if sql_expr is not None:
            return SQL("%s %s %s", sql_expr, self.sql_direction, self.sql_nulls)
        return model._order_field_to_sql(alias, str(self.field_expr), self.sql_direction, self.sql_nulls, query)

    def __repr__(self) -> str:
        direction = 'asc' if self.asc else 'desc'
        if self.nulls:
            direction += f'nulls {self.nulls}'
        return f"OrderExpression({str(self.field_expr)!r}, {direction})"

    def __str__(self) -> str:
        direction = 'asc' if self.asc else 'desc'
        result = f"{self.field_expr} {direction}"
        if self.nulls:
            result += f'nulls {self.nulls}'
        return result


class OrderSpecification:
    def __init__(self, order_spec: str) -> None:
        orders = order_spec.split(',')
        self.items = tuple(OrderExpression(order.strip()) for order in orders)

    def __len__(self):
        return len(self.items)

    def __repr__(self) -> str:
        return f"OrderSpecification{self.items}"

    def __str__(self) -> str:
        return ', '.join(str(item) for item in self.items)
