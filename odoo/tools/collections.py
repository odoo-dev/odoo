# Part of Odoo. See LICENSE file for full copyright and licensing details.
"""
Collections types and utilities used by Odoo.
"""
from __future__ import annotations

import collections
import itertools
import typing
from collections import defaultdict
from collections.abc import Iterable, Iterator, Mapping, MutableMapping, MutableSet, Reversible
from functools import reduce
from itertools import islice
from types import MappingProxyType

from odoo.loglevels import exception_to_unicode

from .misc import SENTINEL, Sentinel, freehash

if typing.TYPE_CHECKING:
    from collections.abc import Callable, Collection, Sequence

__all__ = [
    'DotDict',
    'LastOrderedSet',
    'OrderedSet',
    'exception_to_unicode',
    'frozendict',
    'groupby',
    'is_list_of',
    'merge_sequences',
    'partition',
    'reverse_enumerate',
    'split_every',
    'topological_sort',
    'unique',
]


# ----------------------------------------------------------
# iterables
# ----------------------------------------------------------
def reverse_enumerate[T](lst: Sequence[T]) -> Iterator[tuple[int, T]]:
    """Like enumerate but in the other direction

    Usage::

        >>> a = ['a', 'b', 'c']
        >>> it = reverse_enumerate(a)
        >>> it.next()
        (2, 'c')
        >>> it.next()
        (1, 'b')
        >>> it.next()
        (0, 'a')
        >>> it.next()
        Traceback (most recent call last):
          File "<stdin>", line 1, in <module>
        StopIteration
    """
    return zip(range(len(lst) - 1, -1, -1), reversed(lst))


def partition[T](pred: Callable[[T], bool], elems: Iterable[T]) -> tuple[list[T], list[T]]:
    """ Return a pair equivalent to:
    ``filter(pred, elems), filter(lambda x: not pred(x), elems)`` """
    yes: list[T] = []
    nos: list[T] = []
    for elem in elems:
        (yes if pred(elem) else nos).append(elem)
    return yes, nos


def topological_sort[T](elems: Mapping[T, Collection[T]]) -> list[T]:
    """ Return a list of elements sorted so that their dependencies are listed
    before them in the result.

    :param elems: specifies the elements to sort with their dependencies; it is
        a dictionary like `{element: dependencies}` where `dependencies` is a
        collection of elements that must appear before `element`. The elements
        of `dependencies` are not required to appear in `elems`; they will
        simply not appear in the result.

    :returns: a list with the keys of `elems` sorted according to their
        specification.
    """
    # the algorithm is inspired by [Tarjan 1976],
    # http://en.wikipedia.org/wiki/Topological_sorting#Algorithms
    result = []
    visited = set()

    def visit(n):
        if n not in visited:
            visited.add(n)
            if n in elems:
                # first visit all dependencies of n, then append n to result
                for it in elems[n]:
                    visit(it)
                result.append(n)

    for el in elems:
        visit(el)

    return result


def merge_sequences[T](*iterables: Iterable[T]) -> list[T]:
    """ Merge several iterables into a list. The result is the union of the
        iterables, ordered following the partial order given by the iterables,
        with a bias towards the end for the last iterable::

            seq = merge_sequences(['A', 'B', 'C'])
            assert seq == ['A', 'B', 'C']

            seq = merge_sequences(
                ['A', 'B', 'C'],
                ['Z'],                  # 'Z' can be anywhere
                ['Y', 'C'],             # 'Y' must precede 'C';
                ['A', 'X', 'Y'],        # 'X' must follow 'A' and precede 'Y'
            )
            assert seq == ['A', 'B', 'X', 'Y', 'C', 'Z']
    """
    # dict is ordered
    deps: defaultdict[T, list[T]] = defaultdict(list)  # {item: elems_before_item}
    for iterable in iterables:
        prev: T | Sentinel = SENTINEL
        for item in iterable:
            if prev is SENTINEL:
                deps[item]  # just set the default
            else:
                deps[item].append(prev)
            prev = item
    return topological_sort(deps)


@typing.overload
def split_every[T](n: int, iterable: Iterable[T]) -> Iterator[tuple[T, ...]]:
    ...


@typing.overload
def split_every[T](n: int, iterable: Iterable[T], piece_maker: type[Collection[T]]) -> Iterator[Collection[T]]:
    ...


@typing.overload
def split_every[T, P](n: int, iterable: Iterable[T], piece_maker: Callable[[Iterable[T]], P]) -> Iterator[P]:
    ...


def split_every[T](n: int, iterable: Iterable[T], piece_maker=tuple):
    """Splits an iterable into length-n pieces. The last piece will be shorter
       if ``n`` does not evenly divide the iterable length.

       :param int n: maximum size of each generated chunk
       :param Iterable iterable: iterable to chunk into pieces
       :param piece_maker: callable taking an iterable and collecting each
                           chunk from its slice, *must consume the entire slice*.
    """
    iterator = iter(iterable)
    piece = piece_maker(islice(iterator, n))
    while piece:
        yield piece
        piece = piece_maker(islice(iterator, n))


class ConstantMapping[T](Mapping[typing.Any, T]):
    """
    An immutable mapping returning the provided value for every single key.

    Useful for default value to methods
    """
    __slots__ = ['_value']

    def __init__(self, val: T):
        self._value = val

    def __len__(self):
        """
        defaultdict updates its length for each individually requested key, is
        that really useful?
        """
        return 0

    def __iter__(self):
        """
        same as len, defaultdict updates its iterable keyset with each key
        requested, is there a point for this?
        """
        return iter([])

    def __getitem__(self, item) -> T:
        return self._value


class Collector[K, T](dict[K, tuple[T, ...]]):  # noqa: FURB189
    """ A mapping from keys to tuples.  This implements a relation, and can be
        seen as a space optimization for ``defaultdict(tuple)``.
    """
    __slots__ = ()

    def __getitem__(self, key: K) -> tuple[T, ...]:
        return self.get(key, ())

    def __setitem__(self, key: K, val: Iterable[T]):
        val = tuple(val)
        if val:
            super().__setitem__(key, val)
        else:
            super().pop(key, None)

    def add(self, key: K, val: T):
        vals = self[key]
        if val not in vals:
            self[key] = vals + (val,)

    def discard_keys_and_values(self, excludes: Collection[K | T]) -> None:
        for key in excludes:
            self.pop(key, None)  # type: ignore
        for key, vals in list(self.items()):
            self[key] = tuple(val for val in vals if val not in excludes)  # type: ignore


class StackMap[K, T](MutableMapping[K, T]):
    """ A stack of mappings behaving as a single mapping, and used to implement
        nested scopes. The lookups search the stack from top to bottom, and
        returns the first value found. Mutable operations modify the topmost
        mapping only.
    """
    __slots__ = ['_maps']

    def __init__(self, m: MutableMapping[K, T] | None = None):
        self._maps = [] if m is None else [m]

    def __getitem__(self, key: K) -> T:
        for mapping in reversed(self._maps):
            try:
                return mapping[key]
            except KeyError:
                pass
        raise KeyError(key)

    def __setitem__(self, key: K, val: T):
        self._maps[-1][key] = val

    def __delitem__(self, key: K):
        del self._maps[-1][key]

    def __iter__(self) -> Iterator[K]:
        return iter({key for mapping in self._maps for key in mapping})

    def __len__(self) -> int:
        return sum(1 for key in self)

    def __str__(self) -> str:
        return f"<StackMap {self._maps}>"

    def pushmap(self, m: MutableMapping[K, T] | None = None):
        self._maps.append({} if m is None else m)

    def popmap(self) -> MutableMapping[K, T]:
        return self._maps.pop()


class OrderedSet[T](MutableSet[T]):
    """ A set collection that remembers the elements first insertion order. """
    __slots__ = ['_map']

    def __init__(self, elems: Iterable[T] = ()):
        self._map: dict[T, None] = dict.fromkeys(elems)

    def __contains__(self, elem):
        return elem in self._map

    def __iter__(self):
        return iter(self._map)

    def __reversed__(self):
        return reversed(self._map)

    def __len__(self):
        return len(self._map)

    def add(self, elem):
        self._map[elem] = None

    def discard(self, elem):
        self._map.pop(elem, None)

    def update(self, elems):
        self._map.update(zip(elems, itertools.repeat(None)))

    def difference_update(self, elems):
        for elem in elems:
            self.discard(elem)

    def __repr__(self):
        return f'{type(self).__name__}({list(self)!r})'

    def intersection(self, *others):
        return reduce(OrderedSet.__and__, others, self)

    def copy(self):
        return self.__class__(self)


class LastOrderedSet[T](OrderedSet[T]):
    """ A set collection that remembers the elements last insertion order. """
    def add(self, elem):
        self.discard(elem)
        super().add(elem)


class Callbacks:
    """ A simple queue of callback functions.  Upon run, every function is
    called (in addition order), and the queue is emptied.

    ::

        callbacks = Callbacks()

        # add foo
        def foo():
            print("foo")

        callbacks.add(foo)

        # add bar
        callbacks.add
        def bar():
            print("bar")

        # add foo again
        callbacks.add(foo)

        # call foo(), bar(), foo(), then clear the callback queue
        callbacks.run()

    The queue also provides a ``data`` dictionary, that may be freely used to
    store anything, but is mostly aimed at aggregating data for callbacks.  The
    dictionary is automatically cleared by ``run()`` once all callback functions
    have been called.

    ::

        # register foo to process aggregated data
        @callbacks.add
        def foo():
            print(sum(callbacks.data['foo']))

        callbacks.data.setdefault('foo', []).append(1)
        ...
        callbacks.data.setdefault('foo', []).append(2)
        ...
        callbacks.data.setdefault('foo', []).append(3)

        # call foo(), which prints 6
        callbacks.run()

    Given the global nature of ``data``, the keys should identify in a unique
    way the data being stored.  It is recommended to use strings with a
    structure like ``"{module}.{feature}"``.
    """
    __slots__ = ['_funcs', 'data']

    def __init__(self):
        self._funcs: collections.deque[Callable] = collections.deque()
        self.data = {}

    def add(self, func: Callable) -> None:
        """ Add the given function. """
        self._funcs.append(func)

    def run(self) -> None:
        """ Call all the functions (in addition order), then clear associated data.
        """
        while self._funcs:
            func = self._funcs.popleft()
            func()
        self.clear()

    def clear(self) -> None:
        """ Remove all callbacks and data from self. """
        self._funcs.clear()
        self.data.clear()

    def __len__(self) -> int:
        return len(self._funcs)


class ReversedIterable[T](Reversible[T]):
    """ An iterable implementing the reversal of another iterable. """
    __slots__ = ['iterable']

    def __init__(self, iterable: Reversible[T]):
        self.iterable = iterable

    def __iter__(self):
        return reversed(self.iterable)

    def __reversed__(self):
        return iter(self.iterable)


def groupby[K, T](iterable: Iterable[T], key: Callable[[T], K] = lambda arg: arg) -> Iterable[tuple[K, list[T]]]:
    """ Return a collection of pairs ``(key, elements)`` from ``iterable``. The
        ``key`` is a function computing a key value for each element. This
        function is similar to ``itertools.groupby``, but aggregates all
        elements under the same key, not only consecutive elements.
    """
    groups = defaultdict(list)
    for elem in iterable:
        groups[key(elem)].append(elem)
    return groups.items()


def unique[T](it: Iterable[T]) -> Iterator[T]:
    """ "Uniquifier" for the provided iterable: will output each element of
    the iterable once.

    The iterable's elements must be hashahble.

    :param Iterable it:
    :rtype: Iterator
    """
    seen = set()
    for e in it:
        if e not in seen:
            seen.add(e)
            yield e


def submap[K, T](mapping: Mapping[K, T], keys: Iterable[K]) -> Mapping[K, T]:
    """
    Get a filtered copy of the mapping where only some keys are present.

    :param Mapping mapping: the original dict-like structure to filter
    :param Iterable keys: the list of keys to keep
    :return dict: a filtered dict copy of the original mapping
    """
    keys = frozenset(keys)
    return {key: mapping[key] for key in mapping if key in keys}


class _HashDict[K, V](dict[K, V]):  # noqa: FURB189
    """ Simple extension of ``dict`` that provides a hash function.
        For the hash to be correct, one should not modify the dict's content.
    """

    __slots__ = ()

    def __hash__(self):
        return hash(frozenset((key, freehash(val)) for key, val in self.items()))


class frozendict[K, V]:
    "Immutable dict."
    def __new__(cls, mapping: Iterable[tuple[K, V]] | Mapping[K, V] = (), /, **kw: V):
        """ Return an immutable copy of a mapping.
            This allows the returned proxy mapping to be hashed.
            The reference to the newly created internal dictionary is not
            accessible, which guarantees immutability
        """
        return MappingProxyType(_HashDict(mapping, **kw))

    def __subclasscheck__(self, subclass):
        assert False, "cannot subclass frozendict"  # not a real class


class DotDict[T](dict[str, T]):  # noqa: FURB189
    """Helper for dot.notation access to dictionary attributes

        E.g.
          foo = DotDict({'bar': False})
          return foo.bar
    """
    def __getattr__(self, attrib) -> DotDict | T | None:
        val = self.get(attrib)
        return DotDict(val) if isinstance(val, dict) else val


def is_list_of(values, type_: type) -> bool:
    """Return True if the given values is a list / tuple of the given type.

    :param values: The values to check
    :param type_: The type of the elements in the list / tuple
    """
    return isinstance(values, (list, tuple)) and all(isinstance(item, type_) for item in values)


def has_list_types(values, types: tuple[type, ...]) -> bool:
    """Return True if the given values have the same types as
    the one given in argument, in the same order.

    :param values: The values to check
    :param types: The types of the elements in the list / tuple
    """
    return (
        isinstance(values, (list, tuple)) and len(values) == len(types)
        and all(map(isinstance, values, types))
    )
