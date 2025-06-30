from __future__ import annotations

import re
from typing import Iterable, Iterator
import warnings
from collections.abc import Set as AbstractSet

import dateutil.relativedelta

from odoo.exceptions import AccessError, ValidationError
from odoo.tools import SQL

regex_alphanumeric = re.compile(r'^[a-z0-9_]+$')
regex_object_name = re.compile(r'^[a-z0-9_.]+$')
regex_pg_name = re.compile(r'^[a-z_][a-z0-9_$]*$', re.IGNORECASE)
# match private methods, to prevent their remote invocation
regex_private = re.compile(r'^(_.*|init)$')

# types handled as collections
COLLECTION_TYPES = (list, tuple, AbstractSet)
# The hard-coded super-user id (a.k.a. root user, or OdooBot).
SUPERUSER_ID = 1

# _read_group stuff
READ_GROUP_TIME_GRANULARITY = {
    'hour': dateutil.relativedelta.relativedelta(hours=1),
    'day': dateutil.relativedelta.relativedelta(days=1),
    'week': dateutil.relativedelta.relativedelta(days=7),
    'month': dateutil.relativedelta.relativedelta(months=1),
    'quarter': dateutil.relativedelta.relativedelta(months=3),
    'year': dateutil.relativedelta.relativedelta(years=1)
}

READ_GROUP_NUMBER_GRANULARITY = {
    'year_number': 'year',
    'quarter_number': 'quarter',
    'month_number': 'month',
    'iso_week_number': 'week',  # ISO week number because anything else than ISO is nonsense
    'day_of_year': 'doy',
    'day_of_month': 'day',
    'day_of_week': 'dow',
    'hour_number': 'hour',
    'minute_number': 'minute',
    'second_number': 'second',
}

READ_GROUP_ALL_TIME_GRANULARITY = READ_GROUP_TIME_GRANULARITY | READ_GROUP_NUMBER_GRANULARITY


# SQL operators with spaces around them
# hardcoded to avoid changing SQL injection linting
SQL_OPERATORS = {
    "=": SQL(" = "),
    "!=": SQL(" != "),
    "in": SQL(" IN "),
    "not in": SQL(" NOT IN "),
    "<": SQL(" < "),
    ">": SQL(" > "),
    "<=": SQL(" <= "),
    ">=": SQL(" >= "),
    "like": SQL(" LIKE "),
    "ilike": SQL(" ILIKE "),
    "=like": SQL(" LIKE "),
    "=ilike": SQL(" ILIKE "),
    "not like": SQL(" NOT LIKE "),
    "not ilike": SQL(" NOT ILIKE "),
    "not =like": SQL(" NOT LIKE "),
    "not =ilike": SQL(" NOT ILIKE "),
}


def check_method_name(name):
    """ Raise an ``AccessError`` if ``name`` is a private method name. """
    warnings.warn("Since 19.0, use odoo.service.model.get_public_method", DeprecationWarning)
    if regex_private.match(name):
        raise AccessError('Private methods (such as %s) cannot be called remotely.' % name)


def check_object_name(name):
    """ Check if the given name is a valid model name.

        The _name attribute in osv and osv_memory object is subject to
        some restrictions. This function returns True or False whether
        the given name is allowed or not.

        TODO: this is an approximation. The goal in this approximation
        is to disallow uppercase characters (in some places, we quote
        table/column names and in other not, which leads to this kind
        of errors:

            psycopg2.ProgrammingError: relation "xxx" does not exist).

        The same restriction should apply to both osv and osv_memory
        objects for consistency.

    """
    return regex_object_name.match(name) is not None


def check_pg_name(name):
    """ Check whether the given name is a valid PostgreSQL identifier name. """
    if not regex_pg_name.match(name):
        raise ValidationError("Invalid characters in table name %r" % name)
    if len(name) > 63:
        raise ValidationError("Table name %r is too long" % name)


def parse_field_expr(field_expr: str) -> tuple[str, str | None]:
    if (property_index := field_expr.find(".")) >= 0:
        property_name = field_expr[property_index + 1:]
        field_expr = field_expr[:property_index]
    else:
        property_name = None
    if not field_expr:
        raise ValueError(f"Invalid field expression {field_expr!r}")
    return field_expr, property_name


def expand_ids(id0, ids):
    """ Return an iterator of unique ids from the concatenation of ``[id0]`` and
        ``ids``, and of the same kind (all real or all new).
    """
    yield id0
    seen = {id0}
    kind = bool(id0)
    for id_ in ids:
        if id_ not in seen and bool(id_) == kind:
            yield id_
            seen.add(id_)


class OriginIds:
    """ A reversible iterable returning the origin ids of a collection of ``ids``.
        Actual ids are returned as is, and ids without origin are not returned.
    """
    __slots__ = ['ids']

    def __init__(self, ids):
        self.ids = ids

    def __iter__(self):
        for id_ in self.ids:
            if id_ := id_ or getattr(id_, 'origin', None):
                yield id_

    def __reversed__(self):
        for id_ in reversed(self.ids):
            if id_ := id_ or getattr(id_, 'origin', None):
                yield id_


origin_ids = OriginIds


order_re = re.compile(r'''
(?P<field_expr>[\w\.]+)(\s+(?P<direction>desc|asc))?(\s+(?P<nulls>nulls\s+first|last))?
''', re.IGNORECASE | re.VERBOSE)
field_expr_re = re.compile(r'(?P<fname>\w+)(\.(?P<remaining_path>[\w.]+))?(\:(?P<func>\w+))?')


class FieldExpression:
    __slots__ = ('fname', 'remaining_path', 'func', 'expression')

    def __init__(self, fname: str, remaining_path=None, func=None):
        self.fname: str = fname
        self.remaining_path: str = remaining_path
        self.func: str = func

        expression = fname
        if remaining_path:
            expression = f"{expression}.{remaining_path}"
        if func:
            expression = f"{expression}:{func}"
        self.expression: str = expression

    def __str__(self):
        return self.expression

    def __eq__(self, value):
        return self.expression == value.expression

    def __hash__(self):
        return hash(self.expression)

    @classmethod
    def fromstring(cls, field_expr: str) -> FieldExpression:
        expr_match = field_expr_re.fullmatch(field_expr)
        if not expr_match:
            raise ValueError(f'Invalid field expression {field_expr!r}')
        return FieldExpression(**expr_match.groupdict())


class OrderExpression:
    __slots__ = ('field_expr', 'asc', 'nulls_last')

    def __init__(self, field_expr: FieldExpression, asc: bool = True, nulls_last: bool = True):
        self.field_expr = field_expr
        self.asc = asc
        self.nulls_last = nulls_last

    @classmethod
    def fromstring(cls, order_part: str) -> OrderExpression:
        order_part_match = order_re.fullmatch(order_part.strip())
        if not order_part_match:
            raise ValueError(f'Invalid order expression {order_part!r}.')

        field_expr = order_part_match['field_expr']
        direction = order_part_match['direction']
        nulls = order_part_match['nulls']
        return OrderExpression(
            FieldExpression.fromstring(field_expr),
            asc=(not direction or direction.upper() == 'ASC'),
            nulls_last=(not nulls or nulls.upper() == 'NULLS LAST'),
        )

    def __invert__(self):
        return OrderExpression(self._field_expr, not self._asc, not self._nulls_last)


class OrderSpecification:
    """ Order helper """
    __slots__ = ('_order_expressions',)

    def __init__(self, order_expressions: Iterable[OrderExpression]):
        self._order_expressions = {
            order_expression.field_expr: order_expression
            for order_expression in order_expressions
        }

    @classmethod
    def fromstring(cls, order: str) -> OrderSpecification:
        try:
            return OrderSpecification(
                OrderExpression.fromstring(order_part)
                for order_part in order.split(',')
            )
        except ValueError as e:
            raise ValueError(
                f"Invalid \"order\" specified ({order}): {e}"
                " A valid \"order\" specification is a comma-separated list of valid field names"
                " (optionally followed by asc/desc for the direction)",
            ) from e

    def __invert__(self):
        return OrderSpecification(
            ~order_expression for order_expression in self._order_expressions.values()
        )

    def __iter__(self) -> Iterator[OrderExpression]:
        return iter(self._order_expressions.values())
