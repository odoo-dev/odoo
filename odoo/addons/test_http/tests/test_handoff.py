# Part of Odoo. See LICENSE file for full copyright and licensing details.

import os
import socket
from unittest.mock import patch

from werkzeug.test import EnvironBuilder

from odoo.http import request_var
from odoo.http.handoff import MAX_DATABASES, RegistryHandoff
from odoo.http.requestlib import HTTPRequest, Request
from odoo.http.router import _set_session_and_dbname
from odoo.tests.common import BaseCase


class TestRegistryHandoff(BaseCase):
    def setUp(self):
        super().setUp()
        self.handoff = RegistryHandoff(2)
        self.client, self.server = socket.socketpair()
        self.addCleanup(self.client.close)
        self.addCleanup(self.server.close)
        self.addCleanup(self.handoff.lock_file.close)
        for reader, writer in self.handoff.inboxes:
            self.addCleanup(reader.close)
            self.addCleanup(writer.close)

    def in_child(self, func):
        """ Run ``func`` in another process (fcntl locks do not conflict inside
        of a process), keep it alive and locked until the returned function is
        called. """
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

    def test_send_needs_a_holder(self):
        self.assertFalse(self.handoff.send('db', self.server, b'GET', 0))
        self.handoff.publish(1, ['other'])
        self.assertFalse(self.handoff.send('db', self.server, b'GET', 0))

    def test_send_never_targets_own_slot(self):
        self.handoff.publish(0, ['db'])
        self.assertFalse(self.handoff.send('db', self.server, b'GET', 0))

    def test_send_gives_the_connection_and_the_bytes(self):
        self.handoff.publish(1, ['db'])
        self.assertIsNone(self.handoff.receive(1))
        self.assertTrue(self.handoff.send('db', self.server, b'GET / HTTP/1.1', 0))

        sock, dbname, raw = self.handoff.receive(1)
        with sock:
            self.assertEqual(dbname, 'db')
            self.assertEqual(raw, b'GET / HTTP/1.1')
            # the connection survives the sender closing its descriptor
            self.server.close()
            sock.sendall(b'pong')
            self.assertEqual(self.client.recv(4), b'pong')
        self.assertIsNone(self.handoff.receive(1))

    def test_send_big_prelude(self):
        self.handoff.publish(1, ['db'])
        prelude = b'x' * 32768  # the most HTTPSocket may have read
        self.assertTrue(self.handoff.send('db', self.server, prelude, 0))
        sock, _dbname, raw = self.handoff.receive(1)
        sock.close()
        self.assertEqual(raw, prelude)

    def test_send_does_not_queue_behind_a_busy_worker(self):
        self.handoff.publish(1, ['db'])
        finish = self.in_child(lambda: self.handoff.lock(1))
        self.addCleanup(finish)
        self.assertFalse(self.handoff.send('db', self.server, b'GET', 0))

    def test_send_does_not_queue_behind_a_pending_connection(self):
        self.handoff.publish(1, ['db'])
        self.assertTrue(self.handoff.send('db', self.server, b'first', 0))
        self.assertFalse(self.handoff.send('db', self.server, b'second', 0))
        self.handoff.receive(1)[0].close()
        self.assertTrue(self.handoff.send('db', self.server, b'third', 0))
        self.handoff.receive(1)[0].close()

    def test_lock_goes_away_with_the_process(self):
        finish = self.in_child(lambda: self.handoff.lock(1))
        self.assertFalse(self.handoff.lock(1))
        finish()
        self.assertTrue(self.handoff.lock(1))
        self.handoff.unlock(1)

    def test_published_table_is_shared_after_fork(self):
        finish = self.in_child(lambda: self.handoff.publish(1, ['db']))
        self.addCleanup(finish)
        self.assertTrue(self.handoff.send('db', self.server, b'GET', 0))
        self.handoff.receive(1)[0].close()

    def test_publish_replaces_and_truncates(self):
        self.handoff.publish(1, ['db'])
        self.handoff.publish(1, [f'db{i}' for i in range(MAX_DATABASES + 10)])
        self.assertFalse(self.handoff.send('db', self.server, b'GET', 0))
        self.assertFalse(self.handoff.send('db0', self.server, b'GET', 0))
        self.assertTrue(self.handoff.send(f'db{MAX_DATABASES + 9}', self.server, b'GET', 0))
        self.handoff.receive(1)[0].close()

    def test_forget(self):
        self.handoff.publish(1, ['db'])
        self.handoff.forget(1)
        self.assertFalse(self.handoff.send('db', self.server, b'GET', 0))

    def test_release_slot_closes_what_a_dead_worker_left(self):
        self.assertEqual(self.handoff.acquire_slot(), 1)
        self.handoff.publish(1, ['db'])
        self.handoff.send('db', self.server, b'GET', 0)
        self.server.close()
        self.handoff.release_slot(1)
        self.client.settimeout(5)
        self.assertEqual(self.client.recv(1), b'')  # no client is left hanging
        self.assertEqual(self.handoff.free_slots, [0, 1])

    def test_place_only_when_it_would_evict(self):
        self.handoff.publish(1, ['other'], room=2)
        self.assertFalse(self.handoff.send('db', self.server, b'GET', 0))
        self.assertTrue(self.handoff.send('db', self.server, b'GET', 0, would_evict=True))
        self.handoff.receive(1)[0].close()

    def test_place_needs_room(self):
        self.handoff.publish(1, ['other'], room=0)
        self.assertFalse(self.handoff.send('db', self.server, b'GET', 0, would_evict=True))

    def test_place_on_the_worker_with_most_room(self):
        handoff = RegistryHandoff(4)
        self.addCleanup(handoff.lock_file.close)
        handoff.publish(1, [], room=1)
        handoff.publish(2, [], room=3)
        handoff.publish(3, [], room=2)
        self.assertTrue(handoff.send('db', self.server, b'GET', 0, would_evict=True))
        handoff.receive(2)[0].close()

    def test_place_prefers_a_holder(self):
        handoff = RegistryHandoff(3)
        self.addCleanup(handoff.lock_file.close)
        handoff.publish(1, [], room=5)
        handoff.publish(2, ['db'], room=0)
        self.assertTrue(handoff.send('db', self.server, b'GET', 0, would_evict=True))
        handoff.receive(2)[0].close()

    def test_place_skips_busy_workers(self):
        handoff = RegistryHandoff(3)
        self.addCleanup(handoff.lock_file.close)
        handoff.publish(1, [], room=5)
        handoff.publish(2, [], room=1)
        finish = self.in_child(lambda: handoff.lock(1))
        self.addCleanup(finish)
        self.assertTrue(handoff.send('db', self.server, b'GET', 0, would_evict=True))
        handoff.receive(2)[0].close()

    def test_place_when_the_holder_is_busy(self):
        handoff = RegistryHandoff(3)
        self.addCleanup(handoff.lock_file.close)
        handoff.publish(1, ['db'], room=0)
        handoff.publish(2, [], room=1)
        finish = self.in_child(lambda: handoff.lock(1))
        self.addCleanup(finish)
        self.assertTrue(handoff.send('db', self.server, b'GET', 0, would_evict=True))
        handoff.receive(2)[0].close()

    def test_forget_removes_the_room(self):
        self.handoff.publish(1, ['other'], room=3)
        self.handoff.forget(1)
        self.assertFalse(self.handoff.send('db', self.server, b'GET', 0, would_evict=True))

    def test_no_slot_beyond_the_population(self):
        self.assertIsNotNone(self.handoff.acquire_slot())
        self.assertIsNotNone(self.handoff.acquire_slot())
        self.assertIsNone(self.handoff.acquire_slot())


class TestHandoffDbname(BaseCase):
    def resolve(self, environ_base=None, headers=None):
        environ = EnvironBuilder(path='/web/login', environ_base=environ_base, headers=headers).get_environ()
        with HTTPRequest(environ) as httprequest:
            request = Request(httprequest)
            token = request_var.set(request)
            try:
                _set_session_and_dbname(request)
            finally:
                request_var.reset(token)
        return request.db

    def test_handoff_dbname_avoids_listing_databases(self):
        with patch('odoo.http.router.db_list') as db_list:
            self.assertEqual(self.resolve({'odoo.handoff_dbname': 'handed'}), 'handed')
        db_list.assert_not_called()

    def test_without_handoff_dbname_lists_databases(self):
        with patch('odoo.http.router.db_list', return_value=['mono']) as db_list:
            self.assertEqual(self.resolve(), 'mono')
        db_list.assert_called_once()

    def test_client_cannot_provide_handoff_dbname(self):
        # request headers are all prefixed by HTTP_ in the environ
        with patch('odoo.http.router.db_list', return_value=[]) as db_list:
            self.assertIsNone(self.resolve(headers={'odoo.handoff_dbname': 'handed'}))
        db_list.assert_called_once()
