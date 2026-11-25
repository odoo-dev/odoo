# Part of Odoo. See LICENSE file for full copyright and licensing details.

import os
import socket
from types import SimpleNamespace
from unittest.mock import Mock, patch

from odoo.http.handoff import (
    AUTO,
    AUTO_MIN_WORKERS,
    DIGEST_SIZE,
    DIGESTS,
    MAX_DATABASES,
    SLOT_SIZE,
    RegistryHandoff,
    _digest,
    guess_dbname,
    peek_dbname,
)
from odoo.modules.registry import Registry
from odoo.service.server import WorkerHTTP
from odoo.tests.common import BaseCase
from odoo.tools import config


class TestRegistryHandoff(BaseCase):
    def setUp(self):
        super().setUp()
        self.handoff = self.make(2)
        self.client, self.server = socket.socketpair()
        self.addCleanup(self.client.close)
        self.addCleanup(self.server.close)

    def make(self, slots, max_workers=None):
        handoff = RegistryHandoff(slots, max_workers)
        for reader, writer in handoff.inboxes:
            self.addCleanup(reader.close)
            self.addCleanup(writer.close)
        return handoff

    def in_child(self, func):
        """ Run ``func`` in another process, keep it alive until the returned
        function is called. """
        ready_r, ready_w = os.pipe()
        done_r, done_w = os.pipe()
        pid = os.fork()
        if not pid:
            try:
                func()
                os.write(ready_w, b'.')
                os.read(done_r, 1)
            finally:
                os._exit(0)
        os.read(ready_r, 1)

        def finish():
            os.write(done_w, b'.')
            os.waitpid(pid, 0)
            for fd in (ready_r, ready_w, done_r, done_w):
                os.close(fd)
        return finish

    def advertised(self, slot, dbnames, handoff=None):
        handoff = handoff or self.handoff
        return {dbname for dbname in dbnames if slot in handoff._holders(_digest(dbname), None)}

    def received_by(self, handoff, slots):
        """ Return the slot among ``slots`` that received the connection. """
        [slot] = [slot for slot in slots if handoff.pending(slot)]
        handoff.receive(slot)[0].close()
        return slot

    #
    # Handing off to an idle worker having the registry
    #
    def test_send_needs_a_holder(self):
        self.assertFalse(self.handoff.send('db', self.server, 0))
        self.handoff.publish(1, ['other'])
        self.assertFalse(self.handoff.send('db', self.server, 0))

    def test_holders_in_a_single_scan(self):
        handoff = self.make(4)
        for slot in (0, 1, 3):
            handoff.publish(slot, ['other', 'db'])
        handoff.publish(2, ['other'])
        self.assertEqual(handoff._holders(_digest('db'), None), [0, 1, 3])
        self.assertEqual(handoff._holders(_digest('db'), 1), [0, 3])
        self.assertEqual(handoff._holders(_digest('none'), None), [])

    def test_send_never_targets_own_slot(self):
        self.handoff.publish(0, ['db'])
        self.assertFalse(self.handoff.send('db', self.server, 0))

    def test_send_gives_the_connection_and_the_database(self):
        self.client.sendall(b'GET / HTTP/1.1\r\n\r\n')  # unread by the sender
        self.handoff.publish(1, ['db'])
        self.assertIsNone(self.handoff.receive(1))
        self.assertTrue(self.handoff.send('db', self.server, 0))

        sock, dbname = self.handoff.receive(1)
        with sock:
            self.assertEqual(dbname, 'db')
            # the connection survives the sender closing its descriptor
            self.server.close()
            self.assertEqual(sock.recv(64), b'GET / HTTP/1.1\r\n\r\n')
            sock.sendall(b'pong')
            self.assertEqual(self.client.recv(4), b'pong')
        self.assertIsNone(self.handoff.receive(1))

    def test_send_does_not_queue_behind_a_busy_worker(self):
        self.handoff.publish(1, ['db'])
        self.handoff.set_busy(1, True)
        self.assertFalse(self.handoff.send('db', self.server, 0))
        self.handoff.set_busy(1, False)
        self.assertTrue(self.handoff.send('db', self.server, 0))
        self.handoff.receive(1)[0].close()

    def test_send_does_not_queue_behind_a_pending_connection(self):
        self.handoff.publish(1, ['db'])
        self.assertTrue(self.handoff.send('db', self.server, 0))
        self.assertFalse(self.handoff.send('db', self.server, 0))
        self.handoff.receive(1)[0].close()
        self.assertTrue(self.handoff.send('db', self.server, 0))
        self.handoff.receive(1)[0].close()

    def test_send_prefers_an_idle_holder(self):
        handoff = self.make(4, max_workers=2)
        handoff.publish(1, ['db'])
        handoff.publish(2, ['db'])
        handoff.set_busy(1, True)
        for _ in range(10):
            self.assertTrue(handoff.send('db', self.server, 0))
            self.assertEqual(self.received_by(handoff, [1, 2]), 2)

    def test_busy_flag_is_shared_after_fork(self):
        self.handoff.publish(1, ['db'])
        finish = self.in_child(lambda: self.handoff.set_busy(1, True))
        self.addCleanup(finish)
        self.assertFalse(self.handoff.send('db', self.server, 0))

    def test_published_table_is_shared_after_fork(self):
        finish = self.in_child(lambda: self.handoff.publish(1, ['db']))
        self.addCleanup(finish)
        self.assertTrue(self.handoff.send('db', self.server, 0))
        self.handoff.receive(1)[0].close()

    #
    # Capping the workers having the registry of a database
    #
    def test_cap_queues_behind_a_busy_holder(self):
        handoff = self.make(4, max_workers=2)
        handoff.publish(1, ['db'])
        handoff.publish(2, ['db'])
        handoff.set_busy(1, True)
        handoff.set_busy(2, True)
        self.assertTrue(handoff.send('db', self.server, 0))
        self.assertIn(self.received_by(handoff, [1, 2]), (1, 2))

    def test_cap_queues_even_behind_a_pending_connection(self):
        handoff = self.make(3, max_workers=1)
        handoff.publish(1, ['db'])
        handoff.set_busy(1, True)
        self.assertTrue(handoff.send('db', self.server, 0))
        self.assertTrue(handoff.send('db', self.server, 0))
        for _ in range(2):
            handoff.receive(1)[0].close()
        self.assertIsNone(handoff.receive(1))

    def test_cap_picks_a_busy_holder_at_random(self):
        handoff = self.make(4, max_workers=2)
        for slot in (1, 2):
            handoff.publish(slot, ['db'])
            handoff.set_busy(slot, True)
        picked = set()
        for _ in range(50):  # each one is missed with a chance of 2**-50
            self.assertTrue(handoff.send('db', self.server, 0))
            picked.add(self.received_by(handoff, [1, 2]))
        self.assertEqual(picked, {1, 2})

    def test_below_the_cap_the_sender_loads_the_registry(self):
        handoff = self.make(4, max_workers=3)
        for slot in (1, 2):
            handoff.publish(slot, ['db'])
            handoff.set_busy(slot, True)
        self.assertFalse(handoff.send('db', self.server, 0))

    def test_without_cap_never_queue_behind_a_busy_holder(self):
        handoff = self.make(4, max_workers=None)
        for slot in (1, 2, 3):
            handoff.publish(slot, ['db'])
            handoff.set_busy(slot, True)
        self.assertFalse(handoff.send('db', self.server, 0))

    def test_auto_cap_gives_a_single_database_every_worker(self):
        handoff = self.make(12, max_workers=AUTO)
        for slot in range(1, 12):
            handoff.publish(slot, ['db'])
            handoff.set_busy(slot, True)
        self.assertEqual(handoff.cap(), 12)
        self.assertFalse(handoff.send('db', self.server, 0))

    def test_auto_cap_is_a_fair_share(self):
        handoff = self.make(48, max_workers=AUTO)
        for slot in range(1, 48):
            handoff.publish(slot, [f'db{slot % 3}'])
        handoff.set_busy(5, True)  # the busy word is not a database
        self.assertEqual(handoff.cap(), 16)

    def test_auto_cap_has_a_minimum(self):
        handoff = self.make(12, max_workers=AUTO)
        for slot in range(1, 12):
            handoff.publish(slot, [f'db{slot}', f'other{slot}'])
        self.assertEqual(handoff.cap(), AUTO_MIN_WORKERS)
        for slot in range(1, 1 + AUTO_MIN_WORKERS):
            handoff.publish(slot, [f'db{slot}', 'shared'])
            handoff.set_busy(slot, True)
        handoff.auto_expiry = 0  # count again
        self.assertTrue(handoff.send('shared', self.server, 0))
        self.received_by(handoff, range(1, 1 + AUTO_MIN_WORKERS))

    def test_auto_cap_is_counted_at_most_once_a_second(self):
        handoff = self.make(12, max_workers=AUTO)
        self.assertEqual(handoff.cap(), 12)
        for slot in range(1, 12):
            handoff.publish(slot, [f'db{slot}'])
        self.assertEqual(handoff.cap(), 12, "still the previous count")
        handoff.auto_expiry = 0
        self.assertEqual(handoff.cap(), AUTO_MIN_WORKERS)

    #
    # The table
    #
    def test_publish_replaces_and_truncates(self):
        dbnames = [f'db{i}' for i in range(MAX_DATABASES + 10)]
        self.handoff.publish(1, ['db'])
        self.handoff.publish(1, dbnames)
        self.assertFalse(self.handoff.send('db', self.server, 0))
        self.assertEqual(len(self.advertised(1, dbnames)), MAX_DATABASES)

    def test_publish_advertises_the_excess_once_an_entry_is_free(self):
        dbnames = [f'db{i}' for i in range(MAX_DATABASES + 1)]
        self.handoff.publish(1, dbnames)
        [missing] = set(dbnames) - self.advertised(1, dbnames)
        evicted = next(iter(self.advertised(1, dbnames)))
        dbnames.remove(evicted)
        self.handoff.publish(1, dbnames)
        self.assertEqual(self.advertised(1, dbnames + [evicted]), set(dbnames))
        self.assertIn(missing, self.advertised(1, dbnames))

    def test_publish_keeps_the_entries_that_stay(self):
        self.handoff.publish(1, ['a', 'b', 'c'])
        before = bytes(self.handoff.table[SLOT_SIZE:2 * SLOT_SIZE])
        self.handoff.publish(1, ['a', 'c', 'd'])
        after = bytes(self.handoff.table[SLOT_SIZE:2 * SLOT_SIZE])
        words = range(DIGESTS * DIGEST_SIZE, SLOT_SIZE, DIGEST_SIZE)
        changed = [w for w in words if before[w:w + DIGEST_SIZE] != after[w:w + DIGEST_SIZE]]
        self.assertEqual(len(changed), 1, "only the entry of b, reused by d, is written")
        self.assertEqual(self.advertised(1, 'abcd'), {'a', 'c', 'd'})

    def test_publish_keeps_the_busy_flag(self):
        self.handoff.publish(1, ['a'])
        self.handoff.set_busy(1, True)
        self.handoff.publish(1, ['a', 'b'])
        self.assertFalse(self.handoff._idle(1))

    def test_publish_after_a_restart_clears_the_slot(self):
        self.handoff.publish(1, ['old'])
        self.handoff.entries.clear()  # a new worker on that slot, in its own process
        self.handoff.publish(1, ['new'])
        self.assertEqual(self.advertised(1, ['old', 'new']), {'new'})

    def test_forget(self):
        self.handoff.publish(1, ['db'])
        self.handoff.forget(1)
        self.assertFalse(self.handoff.send('db', self.server, 0))

    #
    # Dead workers
    #
    def test_release_slot_gives_what_a_dead_worker_left_to_a_holder(self):
        handoff = self.make(3)
        self.assertEqual([handoff.acquire_slot(), handoff.acquire_slot()], [2, 1])
        handoff.publish(1, ['db'])
        handoff.send('db', self.server, 0)  # to slot 1, which dies
        handoff.publish(2, ['db'])
        handoff.release_slot(1)
        sock, dbname = handoff.receive(2)
        sock.close()
        self.assertEqual(dbname, 'db')
        self.assertIsNone(handoff.receive(1))
        self.assertEqual(handoff.free_slots, [0, 1])

    def test_release_slot_gives_what_a_dead_worker_left_to_any_worker(self):
        handoff = self.make(3, max_workers=6)
        self.assertEqual([handoff.acquire_slot(), handoff.acquire_slot()], [2, 1])
        handoff.publish(1, ['db'])
        handoff.send('db', self.server, 0)
        handoff.set_busy(2, True)  # no registry, busy, still better than closing
        handoff.release_slot(1)
        handoff.receive(2)[0].close()

    def test_release_slot_closes_when_no_worker_is_left(self):
        self.assertEqual(self.handoff.acquire_slot(), 1)
        self.handoff.publish(1, ['db'])
        self.handoff.send('db', self.server, 0)
        self.server.close()
        self.handoff.release_slot(1)
        self.client.settimeout(5)
        self.assertEqual(self.client.recv(1), b'')  # no client is left hanging
        self.assertEqual(self.handoff.free_slots, [0, 1])

    def test_no_slot_beyond_the_population(self):
        self.assertIsNotNone(self.handoff.acquire_slot())
        self.assertIsNotNone(self.handoff.acquire_slot())
        self.assertIsNone(self.handoff.acquire_slot())


class TestGuessDbname(BaseCase):
    """ The database of a request guessed from its head, without parsing it,
    before handing it off: the worker receiving it resolves it again. """

    def guess(self, target='/web/login', host='acme.example.com', dbfilter='', db_name=(), proxy_mode=False, **headers):
        head = '\r\n'.join([
            f'GET {target} HTTP/1.1', f'Host: {host}',
            *(f"{name.replace('_', '-')}: {value}" for name, value in headers.items()),
        ]).encode()
        options = {'dbfilter': dbfilter, 'db_name': list(db_name), 'proxy_mode': proxy_mode}
        with patch.dict(config.options, options):
            return guess_dbname(head)

    def test_header(self):
        self.assertEqual(self.guess(X_Odoo_Database='db1'), 'db1')

    def test_header_must_pass_the_dbfilter(self):
        self.assertEqual(self.guess(dbfilter='^acme.*$', X_Odoo_Database='acme2'), 'acme2')
        self.assertIsNone(self.guess(dbfilter='^acme.*$', X_Odoo_Database='other'))
        self.assertIsNone(self.guess(db_name=['allowed'], X_Odoo_Database='other'))

    def test_headers_found_by_the_regex(self):
        head = b'GET / HTTP/1.1\r\nx-odoo-DATABASE:\t db1 \r\nHost: h\r\nX-Other: X-Odoo-Database: db2'
        with patch.dict(config.options, {'dbfilter': '', 'db_name': []}):
            self.assertEqual(guess_dbname(head), 'db1')
            self.assertIsNone(guess_dbname(b'GET / HTTP/1.1\r\nMy-X-Odoo-Database: db1'))

    def test_literal_dbfilter(self):
        self.assertEqual(self.guess(dbfilter='^%d$'), 'acme')
        self.assertEqual(self.guess(dbfilter='^%d$', host='www.acme.example.com:8069'), 'acme')
        self.assertEqual(self.guess(dbfilter='^%h$'), 'acme.example.com')
        self.assertEqual(self.guess(dbfilter='^%d_prod$'), 'acme_prod')

    def test_regex_dbfilter_cannot_tell(self):
        self.assertIsNone(self.guess(dbfilter='^%d.*$'))
        self.assertIsNone(self.guess(dbfilter='%d'))
        self.assertIsNone(self.guess(dbfilter='^(%d|demo)$'))

    def test_nothing_to_tell(self):
        self.assertIsNone(self.guess())

    def test_static_files_need_no_registry(self):
        self.assertIsNone(self.guess(target='/web/static/src/x.js', X_Odoo_Database='db1'))
        self.assertEqual(self.guess(target='/web/image/1', X_Odoo_Database='db1'), 'db1')

    def test_forwarded_host_in_proxy_mode(self):
        forwarded = {'X_Forwarded_Host': 'evil.example.com, client.example.com'}
        self.assertEqual(self.guess(dbfilter='^%d$', proxy_mode=True, **forwarded), 'client')
        self.assertEqual(self.guess(dbfilter='^%d$', **forwarded), 'acme')


class TestPeekHandoff(BaseCase):
    """ The request is peeked at, not read: the receiving worker reads it. """

    def connection(self, data):
        client, server = socket.socketpair()
        self.addCleanup(client.close)
        self.addCleanup(server.close)
        client.sendall(data)
        server.settimeout(1)
        return server

    def peek(self, data):
        sock = self.connection(data)
        with patch.dict(config.options, {'dbfilter': '', 'db_name': [], 'proxy_mode': False}):
            dbname = peek_dbname(sock)
        return dbname, sock.recv(len(data))

    def test_peek_without_reading(self):
        request = b'POST /x HTTP/1.1\r\nHost: h\r\nX-Odoo-Database: db1\r\nContent-Length: 2\r\n\r\n{}'
        self.assertEqual(self.peek(request), ('db1', request))

    def test_incomplete_head_tells_nothing(self):
        request = b'GET /x HTTP/1.1\r\nHost: h\r\nX-Odoo-Database: db1\r\n'
        self.assertEqual(self.peek(request), (None, request))

    def hand_off(self, data, loaded=(), sent=True):
        worker = SimpleNamespace(handoff=Mock(), handoff_slot=0, publish_databases=Mock())
        worker.handoff.send.return_value = sent
        with patch.object(Registry, 'registries', dict.fromkeys(loaded)), \
             patch.dict(config.options, {'dbfilter': '', 'db_name': [], 'proxy_mode': False}):
            return WorkerHTTP.hand_off(worker, self.connection(data)), worker

    def test_hand_off(self):
        handed, worker = self.hand_off(b'GET / HTTP/1.1\r\nX-Odoo-Database: db1\r\n\r\n')
        self.assertTrue(handed)
        self.assertEqual(worker.handoff.send.call_args.args[0], 'db1')
        worker.publish_databases.assert_not_called()

    def test_loaded_registry_is_served_here(self):
        handed, worker = self.hand_off(b'GET / HTTP/1.1\r\nX-Odoo-Database: db1\r\n\r\n', loaded=['db1'])
        self.assertFalse(handed)
        worker.handoff.send.assert_not_called()

    def test_loading_here_is_advertised_first(self):
        handed, worker = self.hand_off(b'GET / HTTP/1.1\r\nX-Odoo-Database: db1\r\n\r\n', sent=False)
        self.assertFalse(handed)
        worker.publish_databases.assert_called_once_with(loading='db1')
