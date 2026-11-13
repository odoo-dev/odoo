from __future__ import annotations

import functools
import re
from collections.abc import Iterable
from collections.abc import Set as AbstractSet

import dateutil.relativedelta

from odoo.exceptions import ValidationError
from odoo.tools import SQL

regex_alphanumeric = re.compile(r'^[a-z0-9_]+$', re.IGNORECASE)
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


#
# The value of records._prefetch_ids must be iterable.
#

class Prefetch:
    """ Class for prefetch objects, which are iterables of record ids. The base
    class is an explicit collection of ids, but subclasses provide objects for
    origin ids, mappings of ids by some relational field, and unions.
    """
    __slots__ = ('_arg', '_tree')

    def __init__(self, arg: Iterable = ()):
        # base implementation: self._arg is a tuple of ids
        self._arg = tuple(arg)
        self._tree = {}

    def __iter__(self):
        return iter(self._arg)

    def origin(self) -> Prefetch:
        """ Return a prefetch object for the origin ids of ``self``. """
        if result := self._tree.get('origin'):
            return result
        result = self._tree['origin'] = PrefetchOrigin(self)
        return result

    def relate(self, field, env) -> Prefetch:
        """ Return a prefetch object for the values of a relational field on
        ``self`` (via the field's cache).
        """
        if result := self._tree.get(field):
            return result
        result = self._tree[field] = PrefetchRelational(self, field, env)
        return result

    @staticmethod
    def union(prefetches: Iterable[Prefetch]) -> Prefetch:
        """ Return a prefetch object representing the union of a collection of
        prefetch objects.
        """
        if not prefetches:
            return Prefetch()
        # flattening of unions and quick deduplication
        byid = {
            id(q): q
            for p in prefetches
            for q in (p._arg if isinstance(p, PrefetchUnion) else (p,))
        }
        if len(byid) == 1:
            return next(iter(byid.values()))
        return PrefetchUnion(byid.values())


class PrefetchOrigin(Prefetch):
    __slots__ = ()

    def __init__(self, prefetch: Prefetch):
        # self._arg is a Prefetch object
        self._arg = prefetch
        self._tree = {}

    def __iter__(self):
        for id_ in self._arg:
            if oid := id_ or id_.origin:
                yield oid


class PrefetchRelational(Prefetch):
    __slots__ = ('_env', '_field')

    def __init__(self, prefetch: Prefetch, field, env):
        # self._arg is a Prefetch object
        self._arg = prefetch
        self._tree = {}
        self._field = field
        self._env = env

    def __iter__(self):
        field_cache = self._field._get_cache(self._env)
        if self._field.type == 'many2one':
            for id_ in self._arg:
                if (coid := field_cache.get(id_)) is not None:
                    yield coid
        else:
            for id_ in self._arg:
                for coid in field_cache.get(id_, ()):
                    yield coid


class PrefetchUnion(Prefetch):
    __slots__ = ()

    def __init__(self, prefetches: Iterable[Prefetch]):
        # self._arg is a collection of Prefetch objects
        self._arg = tuple(prefetches)
        self._tree = {}

    def __iter__(self):
        for prefetch in self._arg:
            yield from prefetch


@functools.total_ordering
class ReversibleComparator:
    __slots__ = ('__item', '__none_first', '__reverse')

    def __init__(self, item, reverse: bool = False, none_first: bool = False):
        self.__item = item
        self.__reverse = reverse
        self.__none_first = none_first

    def __lt__(self, other: ReversibleComparator) -> bool:
        item = self.__item
        item_cmp = other.__item
        if item == item_cmp:
            return False
        if item is None:
            return self.__none_first
        if item_cmp is None:
            return not self.__none_first
        if self.__reverse:
            item, item_cmp = item_cmp, item
        return item < item_cmp

    def __eq__(self, other: ReversibleComparator) -> bool:
        return self.__item == other.__item

    def __hash__(self):
        return hash(self.__item)

    def __repr__(self):
        return f"<ReversibleComparator {self.__item!r}{' reverse' if self.__reverse else ''}>"
