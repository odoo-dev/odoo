"""
Registry-aware dispatching of HTTP requests between prefork workers.

Prefork HTTP workers compete on ``accept()``, so a request can land on a worker
that has to build the registry of its database while another one is sitting
idle with that very registry loaded. Such a worker gives the connection to the
idle worker instead, before reading anything from it, and only builds the
registry when no idle worker has it. The database is guessed from the request
head, peeked at: the X-Odoo-Database header, or a literal dbfilter such as
``^%d$``. A database thus sticks to the workers having its registry and its
ormcache.

The number of workers loading the registry of a database can be capped: once
that many workers have it, a request that finds none of them idle waits for one
of them, picked at random, rather than having yet another worker build it. By
default, the cap is the fair share of the workers among the databases they have
loaded, and at least ``AUTO_MIN_WORKERS``: a single database gets all of them.

The workers share the following, all created by the master before forking:

- a table with, for each worker slot, whether the worker is busy, and the
  digests of the databases it has loaded. It is written only by the worker
  owning the slot, one aligned 8-byte word at a time: a digest keeps its place
  while its registry is loaded, so updating an entry never hides the others. It is read without synchronization: it is a hint, a
  wrong entry only means that the registry gets built by the worker that
  receives the request, or that a request waits for a request in progress;
- a datagram socket per slot, the inbox, that carries the connection, before
  anything was read from it, and the database guessed for its request.
  Connections left in the inbox of a worker that died are given to another one.

Enabled for the HTTP workers of the prefork server.
"""

import contextlib
import hashlib
import logging
import mmap
import random
import re
import socket
import sys
import time
from collections.abc import Iterable
from typing import Literal

from odoo.tools import config

from .router import db_filter
from .server import MAX_INCOMPLETE_EVENT_SIZE

_logger = logging.getLogger(__name__)

DIGEST_SIZE = 8  # one word, so that an entry is written in a single store
MAX_DATABASES = 256  # per worker, the excess is simply not advertised
BUSY, DIGESTS = range(2)  # the words of a slot, the digests come last
SLOT_WORDS = DIGESTS + MAX_DATABASES
SLOT_SIZE = SLOT_WORDS * DIGEST_SIZE  # a multiple of 8: every word is aligned
RECV_SIZE = 1024  # a database name
AUTO = 'auto'  # the cap of workers per database follows the databases loaded
AUTO_MIN_WORKERS = 6
AUTO_REFRESH = 1.0  # seconds between two counts of the databases loaded


# The headers that tell the database of a request, found without parsing it.
HEADERS_RE = re.compile(
    rb'\r\n(host|x-forwarded-host|x-odoo-database)[ \t]*:[ \t]*([^\r\n]*?)[ \t]*(?=\r\n|$)',
    re.IGNORECASE,
)


def _digest(dbname: str) -> bytes:
    return hashlib.blake2b(dbname.encode(), digest_size=DIGEST_SIZE).digest()


def peek_dbname(sock: socket.socket) -> str | None:
    """ Return the database guessed for the request on the connection, without
    reading it: the request is peeked at once, in a buffer big enough for any
    request head h11 accepts. A head that did not arrive in full gives none. """
    try:
        peeked = sock.recv(MAX_INCOMPLETE_EVENT_SIZE, socket.MSG_PEEK)
    except (ConnectionError, TimeoutError):
        return None  # reading the request fails the same way
    head, complete, _body = peeked.partition(b'\r\n\r\n')
    return guess_dbname(head) if complete else None


def guess_dbname(head: bytes) -> str | None:
    """ Return the database of a request from its head (request line and
    headers) when they tell it: the X-Odoo-Database header, or a literal
    dbfilter. Only a guess to pick a worker, made without parsing the
    request: that worker parses it and resolves the database again. """
    target = head.split(b' ', 2)[1:2]
    if target and target[0].split(b'/', 3)[2:3] == [b'static']:
        return None  # static files are served without a registry
    headers = {name.lower(): value for name, value in HEADERS_RE.findall(head)}
    host = headers.get(b'host', b'')
    if config['proxy_mode'] and (forwarded := headers.get(b'x-forwarded-host')):
        host = forwarded.rsplit(b',', 1)[-1].strip()  # as ProxyFix does
    host = host.decode('latin-1')
    if dbname := headers.get(b'x-odoo-database', b'').decode('latin-1'):
        return dbname if db_filter([dbname], host=host) else None
    return dbfilter_dbname(host)


def dbfilter_dbname(host: str) -> str | None:
    """ Return the database that a literal dbfilter, such as ``^%d$``, gives
    for the host, without listing the databases. ``None`` when the dbfilter
    is not a literal: then only listing the databases can tell. """
    dbfilter = config['dbfilter']
    literal = dbfilter.removeprefix('^').removesuffix('$')
    fixed = literal.replace('%h', '').replace('%d', '')
    if dbfilter != f'^{literal}$' or re.escape(fixed) != fixed:
        return None
    host = host.partition(':')[0].removeprefix('www.')  # as db_filter() does
    return literal.replace('%h', host).replace('%d', host.partition('.')[0])


class RegistryHandoff:
    def __init__(self, slots: int, max_workers: int | None | Literal['auto'] = None):
        """ ``max_workers`` caps the number of workers loading the registry of
        a database, ``None`` means unlimited, ``AUTO`` a fair share. """
        self.slots = slots
        self.max_workers = max_workers
        self.auto_cap = slots
        self.auto_expiry = 0.0
        self.free_slots = list(range(slots))
        self.table = mmap.mmap(-1, slots * SLOT_SIZE)
        self.words = memoryview(self.table).cast('Q')
        # {slot: {dbname: index of its digest}}, for the slots published by
        # this process: in a worker, its own slot
        self.entries = {}
        self.inboxes = []
        for _slot in range(slots):
            reader, writer = socket.socketpair(socket.AF_UNIX, socket.SOCK_DGRAM)
            reader.setblocking(False)
            writer.setblocking(False)
            self.inboxes.append((reader, writer))

    #
    # Master process
    #
    def acquire_slot(self) -> int | None:
        """ Return a slot for a new worker. There is none for the workers added
        beyond the initial population: they can send, but not receive. """
        return self.free_slots.pop() if self.free_slots else None

    def release_slot(self, slot: int) -> None:
        """ Clean up the slot of a dead worker. A sender may have picked it just
        before it stopped, or it crashed: give what remains in its inbox to the
        other workers rather than leaving clients hanging. """
        self.forget(slot)
        self.free_slots.append(slot)
        live = [other for other in range(self.slots) if other not in self.free_slots]
        while received := self.receive(slot):
            sock, dbname = received
            with sock:
                if not self.send(dbname, sock, None) and not any(
                    self._try_send(other, sock, dbname.encode(), queue=True)
                    for other in random.sample(live, len(live))
                ):
                    _logger.warning("Closing a connection for %s left by slot %s", dbname, slot)

    #
    # Workers
    #
    def reader(self, slot: int) -> socket.socket:
        return self.inboxes[slot][0]

    def publish(self, slot: int, dbnames: Iterable[str]) -> None:
        """ Advertise the given databases in the slot, instead of the previous
        ones. Only the entries that change are written, and each one with a
        single word, so that a reader never misses a database that stays. """
        if slot not in self.entries:
            self.forget(slot)  # start from a clean slot
        entries = self.entries.setdefault(slot, {})
        base = slot * SLOT_WORDS + DIGESTS
        dbnames = set(dbnames)
        for dbname in entries.keys() - dbnames:
            self.words[base + entries.pop(dbname)] = 0
        if added := dbnames - entries.keys():
            free = sorted(set(range(MAX_DATABASES)).difference(entries.values()))
            for dbname, index in zip(added, free):  # the excess is not advertised
                entries[dbname] = index
                self.words[base + index] = int.from_bytes(_digest(dbname), sys.byteorder)

    def forget(self, slot: int) -> None:
        start = slot * SLOT_SIZE
        self.table[start:start + SLOT_SIZE] = bytes(SLOT_SIZE)
        self.entries.pop(slot, None)

    def set_busy(self, slot: int, busy: bool) -> None:
        """ Flag the slot as serving a request: senders only queue a connection
        behind a request in progress when the cap of workers is reached. """
        self.words[slot * SLOT_WORDS + BUSY] = busy

    def pending(self, slot: int) -> bool:
        with contextlib.suppress(BlockingIOError):
            self.reader(slot).recv(1, socket.MSG_PEEK)
            return True
        return False

    def receive(self, slot: int) -> tuple[socket.socket, str] | None:
        """ Return the next connection of the inbox, with the database guessed
        for its request. """
        try:
            message, fds, _flags, _addr = socket.recv_fds(self.reader(slot), RECV_SIZE, 1)
        except BlockingIOError:
            return None
        return socket.socket(fileno=fds[0]), message.decode()

    def send(self, dbname: str, sock: socket.socket, own_slot: int | None) -> bool:
        """ Try to give the connection to another worker, in order of preference:

        - an idle worker having the registry of the given database;
        - when the cap of workers having that registry is reached, one of them
          picked at random, even if busy: the connection waits in its inbox.

        Return whether the connection was given: then the caller must only close
        its socket. Otherwise, the caller loads the registry, which may evict
        another one from its LRU.
        """
        digest = _digest(dbname)
        message = dbname.encode()
        holders = self._holders(digest, own_slot)
        random.shuffle(holders)  # do not favor a slot

        for slot in holders:
            if self._idle(slot) and self._try_send(slot, sock, message):
                _logger.debug("Handed off %s from slot %s to slot %s", dbname, own_slot, slot)
                return True

        if holders and (cap := self.cap()) and len(holders) >= cap:
            for slot in holders:
                if self._try_send(slot, sock, message, queue=True):
                    _logger.debug("Queued %s from slot %s on busy slot %s", dbname, own_slot, slot)
                    return True

        _logger.debug("No worker for %s, slot %s loads it", dbname, own_slot)
        return False

    def cap(self) -> int | None:
        """ Return the number of workers that may load the registry of a
        database, ``None`` for unlimited. """
        if self.max_workers != AUTO:
            return self.max_workers
        now = time.monotonic()
        if now >= self.auto_expiry:
            loaded = set(self.words.tolist()) - {0, 1}  # neither a free entry nor a busy flag
            self.auto_cap = max(AUTO_MIN_WORKERS, -(-self.slots // max(len(loaded), 1)))
            self.auto_expiry = now + AUTO_REFRESH
        return self.auto_cap

    def _try_send(self, slot: int, sock: socket.socket, message: bytes, *, queue: bool = False) -> bool:
        """ Send the connection to the slot. Unless ``queue``, only when nothing
        is waiting in its inbox already: another sender may have just used it.
        """
        if not queue and self.pending(slot):
            return False
        try:
            socket.send_fds(self.inboxes[slot][1], [message], [sock.fileno()])
        except BlockingIOError:
            return False  # the inbox is full
        except OSError:
            _logger.info("Could not hand off to slot %s", slot, exc_info=True)
            return False
        return True

    def _holders(self, digest: bytes, own_slot: int | None) -> list[int]:
        """ Return the other slots advertising the digest. One search per slot
        is faster than one over the table: CPython searches long buffers with
        a slower algorithm. """
        find, size = self.table.find, MAX_DATABASES * DIGEST_SIZE
        return [
            slot
            for slot in range(self.slots)
            if slot != own_slot
            and find(digest, start := (slot * SLOT_WORDS + DIGESTS) * DIGEST_SIZE, start + size) != -1
        ]

    def _idle(self, slot: int) -> bool:
        return not self.words[slot * SLOT_WORDS + BUSY]
