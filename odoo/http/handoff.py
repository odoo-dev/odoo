"""
Registry-aware dispatching of HTTP requests between prefork workers.

Prefork HTTP workers compete on ``accept()``, so a request can land on a worker
that has to build the registry of its database while another one is sitting
idle with that very registry loaded. With hand-off enabled, such a worker gives
the connection to the idle worker instead, and only builds the registry when
no idle worker has it. This makes a database stick to the workers that already
have its registry and its ormcache, without any extra cost when the worker
that accepted the connection already has the registry. And when building the
registry would evict another one, an idle worker with room in its LRU does it
instead, so that all the workers' LRUs get used before anything is evicted.

The workers share the following, all created by the master before forking:

- a table with, for each worker slot, the room left in its LRU and the digests
  of the databases it has loaded. It is written only by the worker owning the slot, and read without
  synchronization: it is a hint, a wrong entry only means that the registry
  gets built by the worker that receives the request;
- a datagram socket per slot, the inbox, that carries the connection, the bytes
  that were already read from it, and the database resolved for the request;
- a lock per slot, held by the worker owning the slot while it is serving a
  request. A sender needs that lock to write in the inbox, which guarantees
  that a connection is never queued behind a request in progress. Those are
  ``fcntl`` locks, so the kernel releases them when a worker dies.

Enabled with the environment variable ``ODOO_REGISTRY_HANDOFF``.
"""

import contextlib
import fcntl
import hashlib
import logging
import mmap
import os
import socket
import struct
import tempfile
from collections.abc import Iterable

_logger = logging.getLogger(__name__)

DIGEST_SIZE = 8
MAX_DATABASES = 256  # per worker, the excess is simply not advertised
DIGESTS_SIZE = DIGEST_SIZE * MAX_DATABASES
ROOM = struct.Struct('=I')  # at the beginning of a slot, then the digests
SLOT_SIZE = ROOM.size + DIGESTS_SIZE
RECV_SIZE = 65536  # bigger than the 32kiB HTTPSocket may have read, and a dbname


class HandedOff(BaseException):
    """ The connection is now the responsibility of another worker. """


def _digest(dbname: str) -> bytes:
    return hashlib.blake2b(dbname.encode(), digest_size=DIGEST_SIZE).digest()


class RegistryHandoff:
    def __init__(self, slots: int):
        self.slots = slots
        self.free_slots = list(range(slots))
        self.table = mmap.mmap(-1, slots * SLOT_SIZE)
        # never close this file: closing any descriptor of a file in a process
        # drops all the fcntl locks of that process on the file
        self.lock_file = tempfile.TemporaryFile()  # noqa: SIM115
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
        """ Clean up the slot of a dead worker. A worker that exits normally
        serves its inbox, so what remains here belongs to a worker that crashed:
        close those connections rather than leaving clients hanging. """
        self.forget(slot)
        while received := self.receive(slot):
            received[0].close()
        self.free_slots.append(slot)

    #
    # Workers
    #
    def reader(self, slot: int) -> socket.socket:
        return self.inboxes[slot][0]

    def publish(self, slot: int, dbnames: Iterable[str], room: int = 0) -> None:
        digests = b''.join(_digest(dbname) for dbname in list(dbnames)[-MAX_DATABASES:])
        start = slot * SLOT_SIZE
        self.table[start:start + SLOT_SIZE] = ROOM.pack(room) + digests.ljust(DIGESTS_SIZE, b'\0')

    def forget(self, slot: int) -> None:
        self.publish(slot, ())

    def lock(self, slot: int, *, blocking: bool = False) -> bool:
        """ Lock the slot. As a process does not conflict with its own locks,
        this says nothing about a slot already locked by the current worker. """
        flags = fcntl.LOCK_EX if blocking else fcntl.LOCK_EX | fcntl.LOCK_NB
        try:
            fcntl.lockf(self.lock_file, flags, 1, slot)
        except BlockingIOError:
            return False
        except PermissionError:  # some systems report a conflict with EACCES
            return False
        return True

    def unlock(self, slot: int) -> None:
        fcntl.lockf(self.lock_file, fcntl.LOCK_UN, 1, slot)

    def pending(self, slot: int) -> bool:
        with contextlib.suppress(BlockingIOError):
            self.reader(slot).recv(1, socket.MSG_PEEK)
            return True
        return False

    def receive(self, slot: int) -> tuple[socket.socket, str, bytes] | None:
        """ Return the next connection of the inbox, with the database resolved
        for its request and its first bytes. """
        if not self.pending(slot):
            return None
        message, fds, _flags, _addr = socket.recv_fds(self.reader(slot), RECV_SIZE, 1)
        dbname, _, raw = message.partition(b'\0')
        return socket.socket(fileno=fds[0]), dbname.decode(), raw

    def send(
        self,
        dbname: str,
        sock: socket.socket,
        raw: bytes,
        own_slot: int | None,
        *,
        would_evict: bool = False,
    ) -> bool:
        """ Try to give the connection to an idle worker having the registry of
        the given database or, when the current worker would have to evict a
        registry to load it (``would_evict``), to the idle worker having the
        most room for it. On success, the caller must only close its socket.
        """
        digest = _digest(dbname)
        message = b'%s\0%s' % (dbname.encode(), raw)
        first = 0 if own_slot is None else own_slot + 1  # do not favor a slot
        slots = [
            slot
            for slot in (index % self.slots for index in range(first, first + self.slots))
            if slot != own_slot
        ]

        for slot in slots:
            if self._try_send(slot, lambda slot: self._holds(slot, digest), sock, message):
                _logger.debug("Handed off %s from slot %s to slot %s", dbname, own_slot, slot)
                return True

        if would_evict:
            # sorted() is stable, the rotation decides between equals
            for slot in sorted(slots, key=self._room, reverse=True):
                if not self._room(slot):
                    break
                if self._try_send(slot, self._room, sock, message):
                    _logger.debug("Placed %s from slot %s on slot %s", dbname, own_slot, slot)
                    return True

        _logger.debug("No idle worker for %s, slot %s loads it", dbname, own_slot)
        return False

    def _try_send(self, slot: int, is_candidate, sock: socket.socket, message: bytes) -> bool:
        """ Send the connection to the slot if it is idle and still a candidate
        once locked: the worker may have changed its mind in the meantime. """
        if not is_candidate(slot) or not self.lock(slot):
            return False
        try:
            # another sender may have just used this inbox
            if is_candidate(slot) and not self.pending(slot):
                socket.send_fds(self.inboxes[slot][1], [message], [sock.fileno()])
                return True
        except OSError:
            _logger.info("Could not hand off to slot %s", slot, exc_info=True)
        finally:
            self.unlock(slot)
        return False

    def _holds(self, slot: int, digest: bytes) -> bool:
        start = slot * SLOT_SIZE + ROOM.size
        return self.table.find(digest, start, start + DIGESTS_SIZE) != -1

    def _room(self, slot: int) -> int:
        return ROOM.unpack_from(self.table, slot * SLOT_SIZE)[0]
