import functools
import typing
from collections.abc import Reversible

from odoo.tools.misc import freehash


@functools.total_ordering
class NewId:
    """ Pseudo-ids for new records, encapsulating an optional origin id (actual
        record id) and an optional reference (any value).
    """
    __slots__ = ('origin', 'ref', '__hash')  # noqa: RUF023

    def __init__(self, origin=None, ref=None):
        self.origin = origin
        self.ref = ref
        self.__hash = hash(origin or ref or id(self))

    def __bool__(self):
        return False

    def __eq__(self, other):
        return isinstance(other, NewId) and (
            (self.origin and other.origin and self.origin == other.origin)
            or (self.ref and other.ref and self.ref == other.ref)
        )

    def __hash__(self):
        return self.__hash

    def __lt__(self, other):
        # expected order: 1, NewId(1), 2, NewId(2), NewId()
        if isinstance(other, NewId):
            other = other.origin
            if other is None:
                return bool(self.origin)
        if isinstance(other, int):
            return bool(self.origin) and self.origin < other
        return NotImplemented

    def __repr__(self):
        return (
            "<NewId origin=%r>" % self.origin if self.origin else
            "<NewId ref=%r>" % self.ref if self.ref else
            "<NewId 0x%x>" % id(self)
        )

    def __str__(self):
        if self.origin or self.ref:
            id_part = repr(self.origin or self.ref)
        else:
            id_part = hex(id(self))
        return "NewId_%s" % id_part

    class origin_ids(Reversible):
        """ A reversible iterable returning the origin ids of a collection of ``ids``.
        Actual ids are returned as is, and ids without origin are not returned.
        """
        __slots__ = ['ids']

        def __init__(self, ids):
            self.ids = ids

        def __eq__(self, other):
            return isinstance(other, self.__class__) and self.ids == other.ids

        def __hash__(self):
            return freehash(self.ids) ^ 1

        def __iter__(self):
            for id_ in self.ids:
                if id_ := id_ or id_.origin:
                    yield id_

        def __reversed__(self):
            for id_ in reversed(self.ids):
                if id_ := id_ or id_.origin:
                    yield id_

    class new_ids(Reversible):
        """ A reversible iterable returning the new ids of a collection of ``ids``.
        New ids are returned as is, and new ids with origin are returned for the others.
        """
        __slots__ = ['ids']

        def __init__(self, ids):
            self.ids = ids

        def __eq__(self, other):
            return isinstance(other, self.__class__) and self.ids == other.ids

        def __hash__(self):
            return freehash(self.ids) ^ 1

        def __iter__(self):
            for id_ in self.ids:
                yield id_ and NewId(id_)

        def __reversed__(self):
            for id_ in reversed(self.ids):
                yield id_ and NewId(id_)


# By default, in the ORM we initialize it as an int, but any type should work.
# However, and some parts of the ORM may assume it is an integer.
# Non-exhaustive list: relational fields, references, hierarchies, etc.
IdType: typing.TypeAlias = int | NewId | str
