# Part of Odoo. See LICENSE file for full copyright and licensing details.
""" A hash table of bytes in memory shared by the processes of a server.

The table lives in an anonymous file (``memfd``, or an unlinked temporary file)
mapped with ``MAP_SHARED``. When it is created before the workers are forked,
all the workers share it; it disappears with the last process of the server, so
it never outlives the code that filled it.

Layout::

    header | magic (8) | generation (8) | end of the data (8) | entries (8) |
    slots  | hash (8) | offset (8) | value length (4) | key length (4) | x SLOTS
    data   | key | value | key | value | ...   (append only)

The tables are configured by the option ``--shared-memory``, as a size in MB
per cache, optionally followed by ``lru=True|False``:
``templates:64,default:16,lru=False``. The shared tables are created by the
prefork server only. ``lru`` adds a local table in each process, with the
values themselves (not serialized); it is the default without shared table.

A key is ``state + b'\\0' + rest``, where ``state`` is the ``repr`` of
``(dbname, db_oid, registry_sequence, signaling_sequences)``: the state of the
database for which the value was computed. When the table is full, it evicts the entries of the old states of each database first (the
oldest first, so a registry sequence goes away with its last signaling
sequences), until ``--shared-memory-evict`` percent of the table is free, then
compacts the data. If the old states are not enough, it evicts the oldest
entries of the current states: the table is too small.

Writers serialize with a lock (``lockf`` between processes, a thread lock
inside a process). Readers do not lock: a slot is published by writing its
hash last, and the data of a published slot never changes until an eviction.
An eviction makes the generation odd while it moves the data; readers check
the generation before and after a read.
"""
from __future__ import annotations

import ast
import fcntl
import hashlib
import logging
import mmap
import os
import struct
import tempfile
import threading
import time

_logger = logging.getLogger(__name__)

__all__ = [
    'LocalTable', 'SharedHashTable', 'get_cache_tables', 'get_shared_tables',
    'init_shared_tables', 'parse_shared_memory', 'shared_memory_size', 'shared_state_key',
]

_MAGIC = b'ODOOSHM1'
_HEADER = struct.Struct('<8sQQQ')  # magic, generation, end of the data, entries
_HEADER_SIZE = 64
_SLOT = struct.Struct('<QQII')  # hash, offset, value length, key length
_GENERATION = struct.Struct('<Q')
_GENERATION_OFFSET = 8
_END_OFFSET = 16
_END = struct.Struct('<QQ')  # end of the data, entries
_SLOT_BYTES = 4096  # one slot per 4 KB of data (median compiled template: 10 KB)


def _slots(size: int) -> int:
    """ A power of 2 close to one slot per ``_SLOT_BYTES``. """
    return 1 << max(6, (size // _SLOT_BYTES).bit_length() - 1)


class SharedHashTable:
    """ Open addressing hash table from bytes to bytes in shared memory. """
    serialize = True  # values are bytes

    def __init__(self, size: int, slots: int = 0, name: str = '', evict_percent: int = 5):
        slots = slots or _slots(size)
        assert size > _HEADER_SIZE + slots * _SLOT.size, "shared memory too small"
        assert 0 < evict_percent <= 100
        self.name = name
        self.evict_percent = evict_percent
        self.size = size
        self.slots = slots
        self.data_start = _HEADER_SIZE + slots * _SLOT.size
        # writes are rare: stop at 3/4 of the slots, to keep probing short
        self.max_entries = slots * 3 // 4
        self._thread_lock = threading.Lock()
        if hasattr(os, 'memfd_create'):
            self._fd = os.memfd_create('odoo-shared-cache', os.MFD_CLOEXEC)
        else:
            file = tempfile.TemporaryFile(prefix='odoo-shared-cache-')  # noqa: SIM115
            self._fd = os.dup(file.fileno())
            file.close()
        os.ftruncate(self._fd, size)  # sparse: pages are allocated on write
        self._mm = mmap.mmap(self._fd, size, mmap.MAP_SHARED, mmap.PROT_READ | mmap.PROT_WRITE)
        _HEADER.pack_into(self._mm, 0, _MAGIC, 0, self.data_start, 0)
        # statistics of the process
        self.hits = self.misses = self.writes = 0

    @property
    def evictions(self) -> int:
        """ Number of evictions in the table, by all the processes. """
        [generation] = _GENERATION.unpack_from(self._mm, _GENERATION_OFFSET)
        return generation // 2

    @property
    def usage(self) -> tuple[int, int]:
        """ Return the number of entries and the bytes of data. """
        end, entries = _END.unpack_from(self._mm, _END_OFFSET)
        return entries, end - self.data_start

    def _hash(self, key: bytes) -> int:
        return int.from_bytes(hashlib.blake2b(key, digest_size=8).digest(), 'little') or 1

    def _find(self, key: bytes, h: int) -> tuple[int, tuple[int, int, int] | None]:
        """ Return the index of the slot of ``key`` or of the first empty slot,
        and (value offset, value length) when found. """
        mm = self._mm
        index = h % self.slots
        for _ in range(self.slots):
            slot_h, offset, length, key_length = _SLOT.unpack_from(mm, _HEADER_SIZE + index * _SLOT.size)
            if not slot_h:
                return index, None
            if slot_h == h and key_length == len(key) and mm[offset:offset + key_length] == key:
                return index, (offset + key_length, length)
            index = (index + 1) % self.slots
        return -1, None

    def get(self, key: bytes) -> bytes | None:
        """ Return a copy of the value of ``key``, or ``None``. """
        mm = self._mm
        [generation] = _GENERATION.unpack_from(mm, _GENERATION_OFFSET)
        if generation & 1:
            return None  # eviction in progress
        _index, found = self._find(key, self._hash(key))
        if found is None:
            self.misses += 1
            return None
        start, length = found
        if start + length > self.size:
            return None  # torn read during an eviction
        value = mm[start:start + length]
        [generation_after] = _GENERATION.unpack_from(mm, _GENERATION_OFFSET)
        if generation_after != generation:
            self.misses += 1
            return None
        self.hits += 1
        return value

    def set(self, key: bytes, value: bytes) -> bool:
        """ Add ``key`` with ``value`` unless it is already there. Values are
        never replaced: keys must identify their value. Return whether the
        value is in the table. """
        if self.data_start + len(key) + len(value) > self.size:
            _logger.warning("shared memory %r: value of %d KB larger than the table, not shared", self.name, len(value) // 1024)
            return False
        h = self._hash(key)
        with self._thread_lock:
            fcntl.lockf(self._fd, fcntl.LOCK_EX)
            try:
                index, found = self._find(key, h)
                if found is not None:
                    return True
                mm = self._mm
                end, entries = _END.unpack_from(mm, _END_OFFSET)
                if index < 0 or end + len(key) + len(value) > self.size or entries >= self.max_entries:
                    reason = "slots" if index < 0 or entries >= self.max_entries else "data"
                    self._evict(reason, len(key) + len(value))
                    index, _found = self._find(key, h)
                    end, entries = _END.unpack_from(mm, _END_OFFSET)
                mm[end:end + len(key)] = key
                mm[end + len(key):end + len(key) + len(value)] = value
                _END.pack_into(mm, _END_OFFSET, end + len(key) + len(value), entries + 1)
                slot = _HEADER_SIZE + index * _SLOT.size
                struct.pack_into('<QII', mm, slot + 8, end, len(value), len(key))
                struct.pack_into('<Q', mm, slot, h)  # publish: the hash last
                self.writes += 1
                return True
            finally:
                fcntl.lockf(self._fd, fcntl.LOCK_UN)

    def _entries(self) -> list[tuple[int, int, int, int]]:
        """ Return the entries as (offset, key length, value length, hash),
        in the order of writing (called with the lock). """
        result = [
            (offset, key_length, length, h)
            for h, offset, length, key_length in _SLOT.iter_unpack(self._mm[_HEADER_SIZE:self.data_start])
            if h
        ]
        result.sort()
        return result

    def _evict(self, reason: str, needed: int) -> None:
        """ Free ``evict_percent`` of the slots or of the data (the one that is
        full), and at least ``needed`` bytes, by evicting the old states first
        (called with the lock). """
        start_time = time.monotonic()
        mm = self._mm
        entries = self._entries()
        old_end, _count = _END.unpack_from(mm, _END_OFFSET)

        # free the percentage of what is full: the slots or the data
        if reason == 'slots':
            target_bytes = max(0, needed - (self.size - old_end))
            target_count = max(1, self.max_entries * self.evict_percent // 100)
        else:
            capacity = self.size - self.data_start
            target_bytes = max(needed - (self.size - old_end), capacity * self.evict_percent // 100)
            target_count = 0
        evicted, evicted_old, freed = choose_evictions(
            [(mm[offset:offset + key_length], key_length + length) for offset, key_length, length, _h in entries],
            target_bytes, target_count,
        )

        # compact the data and rebuild the index
        [generation] = _GENERATION.unpack_from(mm, _GENERATION_OFFSET)
        _GENERATION.pack_into(mm, _GENERATION_OFFSET, generation + 1)  # odd: readers miss
        mm[_HEADER_SIZE:self.data_start] = bytes(self.data_start - _HEADER_SIZE)
        end = self.data_start
        kept = 0
        for i, (offset, key_length, length, h) in enumerate(entries):
            if i in evicted:
                continue
            if offset != end:
                mm.move(end, offset, key_length + length)
            index = h % self.slots
            while _SLOT.unpack_from(mm, _HEADER_SIZE + index * _SLOT.size)[0]:
                index = (index + 1) % self.slots
            _SLOT.pack_into(mm, _HEADER_SIZE + index * _SLOT.size, h, end, length, key_length)
            end += key_length + length
            kept += 1
        _END.pack_into(mm, _END_OFFSET, end, kept)
        _GENERATION.pack_into(mm, _GENERATION_OFFSET, generation + 2)

        # give the freed pages back to the system
        if hasattr(mmap, 'MADV_REMOVE'):
            page_start = -(-end // mmap.PAGESIZE) * mmap.PAGESIZE
            if old_end > page_start:
                try:
                    mm.madvise(mmap.MADV_REMOVE, page_start, old_end - page_start)
                except OSError:
                    pass

        _log_eviction(self.name, reason, len(evicted), evicted_old, freed, start_time, kept, end - self.data_start, self.size)

    def clear(self) -> None:
        """ Remove all the entries. """
        with self._thread_lock:
            fcntl.lockf(self._fd, fcntl.LOCK_EX)
            try:
                mm = self._mm
                [generation] = _GENERATION.unpack_from(mm, _GENERATION_OFFSET)
                _GENERATION.pack_into(mm, _GENERATION_OFFSET, generation + 1)
                mm[_HEADER_SIZE:self.data_start] = bytes(self.data_start - _HEADER_SIZE)
                _END.pack_into(mm, _END_OFFSET, self.data_start, 0)
                _GENERATION.pack_into(mm, _GENERATION_OFFSET, generation + 2)
            finally:
                fcntl.lockf(self._fd, fcntl.LOCK_UN)


def choose_evictions(entries: list[tuple[bytes, int]], target_bytes: int, target_count: int) -> tuple[set[int], int, int]:
    """ Choose the entries to evict among ``entries``, a list of (key, size)
    in the order of writing: the old states of the databases first (oldest
    first), then the oldest entries, until ``target_bytes`` and
    ``target_count`` are reached. Return the indexes to evict, how many are
    of old states, and their size. """
    # the state of each entry: (dbname, db_oid, registry_seq, sequences)
    states = {}  # {state bytes: parsed state or None}
    entry_states = []
    for key, _size in entries:
        state = key.partition(b'\0')[0] if b'\0' in key else b''
        if state not in states:
            try:
                parsed = ast.literal_eval(state.decode())
            except (ValueError, SyntaxError, UnicodeDecodeError, MemoryError, RecursionError):
                parsed = None
            states[state] = parsed if isinstance(parsed, tuple) and len(parsed) == 4 and parsed[3] is not None else None
        entry_states.append(state)

    # the current state of a database: the most recent registry and
    # signaling sequences of the database it was written last for
    latest_oid = {}
    for state in entry_states:
        if (parsed := states[state]) is not None:
            latest_oid[parsed[0]] = parsed[1]
    current = {}
    for state, parsed in states.items():
        if parsed is not None and parsed[1] == latest_oid[parsed[0]]:
            version = (parsed[2], list(parsed[3]))
            if parsed[0] not in current or version > current[parsed[0]][0]:
                current[parsed[0]] = (version, state)
    current_states = {state for _version, state in current.values()}

    def age(state):
        # by database, the oldest states first: removed databases, then
        # the sequences of the registry and signaling
        parsed = states[state]
        return (parsed[0], parsed[1] == latest_oid[parsed[0]], parsed[2], list(parsed[3]))

    old_states = sorted(
        (state for state, parsed in states.items() if parsed is not None and state not in current_states),
        key=age,
    )
    rank = {state: i for i, state in enumerate(old_states)}
    # old states first (oldest first), then the others by order of writing
    order = sorted(
        range(len(entries)),
        key=lambda i: (0, rank[entry_states[i]], i) if entry_states[i] in rank else (1, 0, i),
    )
    evicted = set()
    freed = evicted_old = 0
    for i in order:
        if freed >= target_bytes and len(evicted) >= target_count:
            break
        evicted.add(i)
        freed += entries[i][1]
        evicted_old += entry_states[i] in rank
    return evicted, evicted_old, freed


def _log_eviction(name, reason, evicted, evicted_old, freed, start_time, kept, used, size):
    evicted_current = evicted - evicted_old
    _logger.log(
        logging.WARNING if evicted_current else logging.INFO,
        "shared memory %r full (%s): evicted %d entries of old states and %d of current states, "
        "%d MB in %.0f ms; %d entries, %d/%d MB left.%s",
        name, reason, evicted_old, evicted_current, freed >> 20,
        (time.monotonic() - start_time) * 1000, kept, used >> 20, size >> 20,
        " The size in --shared-memory is too small." if evicted_current else "",
    )


def shared_state_key(dbname: str, db_oid: int, registry_sequence: int, sequences, rest: bytes) -> bytes:
    """ Return the key of ``rest`` for the given state of the database. """
    state = repr((dbname, db_oid, registry_sequence, tuple(sequences))).encode()
    return state + b'\0' + rest


class LocalTable:
    """ A table in the memory of the process, with the interface of
    :class:`SharedHashTable`, that keeps the values themselves (not
    serialized). """
    serialize = False  # values are objects

    def __init__(self, entries: int, name: str = ''):
        from odoo.tools.lru import LRU  # noqa: PLC0415
        self.name = name
        self.entries = entries
        self._lru = LRU(entries)
        self._lock = threading.Lock()
        # statistics of the process
        self.hits = self.misses = self.writes = 0

    def get(self, key: bytes):
        value = self._lru.get(key)
        if value is None:
            self.misses += 1
        else:
            self.hits += 1
        return value

    def set(self, key: bytes, value) -> bool:
        with self._lock:
            if self._lru.get(key) is None:
                self._lru[key] = value
                self.writes += 1
        return True

    def clear(self) -> None:
        self._lru.clear()


# the shared tables of the server, created by the prefork server
_shared_tables: dict[str, SharedHashTable] = {}
# {cache name: (local table, shared table)} of the process
_cache_tables: dict[str, tuple[LocalTable | None, SharedHashTable | None]] = {}
_cache_tables_lock = threading.Lock()


def parse_shared_memory(value: str) -> dict[str, tuple[int, bool | None]]:
    """ Parse ``templates:64,lru=False,default:16`` into ``{'templates': (64
    MB in bytes, False), 'default': (16 MB in bytes, None)}``, where ``lru``
    is ``None`` when not given. """
    result = {}
    name = None
    for item in value.split(','):
        if not (item := item.strip()):
            continue
        if '=' in item:
            option, _sep, option_value = (part.strip() for part in item.partition('='))
            if option != 'lru' or option_value not in ('True', 'False') or name is None:
                raise ValueError(f"invalid shared memory {item!r}, expected lru=True or lru=False after cache:size_in_MB")
            result[name] = (result[name][0], option_value == 'True')
            continue
        name, sep, size = (part.strip() for part in item.partition(':'))
        if not sep or not name or not size.isdigit():
            raise ValueError(f"invalid shared memory {item!r}, expected cache:size_in_MB")
        result[name] = (int(size) << 20, None)
    return result


def _parse_option() -> dict[str, tuple[int, bool | None]]:
    from odoo.orm.registry import _REGISTRY_CACHES  # noqa: PLC0415
    from odoo.tools import config  # noqa: PLC0415
    result = {}
    for name, conf in parse_shared_memory(config['shared_memory'] or '').items():
        if name not in _REGISTRY_CACHES or '.' in name:
            _logger.warning("shared memory: unknown cache %r, ignored", name)
            continue
        result[name] = conf
    return result


def init_shared_tables() -> None:
    """ Create the shared tables of the server from the option
    ``--shared-memory``. Call it before forking the workers, so that they
    share them. """
    from odoo.tools import config  # noqa: PLC0415
    evict_percent = config['shared_memory_evict']
    for name, (size, _lru) in _parse_option().items():
        if not size or name in _shared_tables:
            continue
        table = _shared_tables[name] = SharedHashTable(size, name=name, evict_percent=evict_percent)
        _logger.info("shared memory %r: %d MB, %d slots, evicts %d%%", name, size >> 20, table.slots, evict_percent)


def get_cache_tables(name: str) -> tuple[LocalTable | None, SharedHashTable | None]:
    """ Return the local table and the shared table of the cache ``name``. """
    try:
        return _cache_tables[name]
    except KeyError:
        pass
    with _cache_tables_lock:
        if name not in _cache_tables:
            local = None
            shared = _shared_tables.get(name)
            if conf := _parse_option().get(name):
                size, lru = conf
                if lru if lru is not None else shared is None:
                    # as many entries as a shared table of that size
                    local = LocalTable(_slots(size) if size else 1024, name=name)
            _cache_tables[name] = (local, shared)
        return _cache_tables[name]


def get_shared_tables() -> dict[str, SharedHashTable | LocalTable]:
    """ Return the tables of the process, by name (for statistics). """
    result = {}
    for name, (local, shared) in list(_cache_tables.items()):
        if shared is not None:
            result[name] = shared
        if local is not None:
            result[f'{name} (local)'] = local
    return result


def shared_memory_size() -> int:
    """ Return the size of the shared tables mapped in this process: they
    count in its virtual memory. """
    return sum(table.size for table in _shared_tables.values())
