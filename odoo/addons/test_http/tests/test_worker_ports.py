# Part of Odoo. See LICENSE file for full copyright and licensing details.

import os
import socket
from types import SimpleNamespace
from unittest.mock import patch

from odoo.service.server import PreforkServer, WorkerHTTP
from odoo.tests.common import BaseCase
from odoo.tools import config


class TestWorkerPorts(BaseCase):
    def setUp(self):
        super().setUp()
        self.multi = SimpleNamespace(
            socket=self.listen(),
            worker_sockets=[self.listen(), self.listen()],
            free_slots={0, 1},
            timeout=60,
            limit_request=100,
        )

    def listen(self):
        sock = socket.create_server(('127.0.0.1', 0))
        sock.setblocking(False)
        self.addCleanup(sock.close)
        return sock

    def worker(self):
        worker = WorkerHTTP(self.multi)
        self.addCleanup(worker.close)
        return worker

    def test_a_restarted_worker_takes_its_port_back(self):
        dead = WorkerHTTP(self.multi)
        workers = [dead, self.worker(), self.worker()]
        self.assertEqual([worker.slot for worker in workers], [0, 1, None])
        self.assertEqual(workers[2].sockets, [self.multi.socket], "no port beyond the population")
        dead.close()
        restarted = self.worker()
        self.assertEqual(restarted.sockets, [self.multi.worker_sockets[0], self.multi.socket])

    def test_own_port_is_served_first(self):
        worker = self.worker()
        for sock in (self.multi.socket, worker.sockets[0]):
            self.addCleanup(socket.create_connection(sock.getsockname()).close)
        served = []
        with patch.object(WorkerHTTP, 'process_request', lambda _self, client, _addr: served.append(client.getsockname())):
            for _ in range(3):
                worker.process_work()
        self.assertEqual(served, [sock.getsockname() for sock in worker.sockets])

    def test_reload_keeps_the_worker_sockets(self):
        sockets = [socket.create_server(('127.0.0.1', 0)) for _ in range(2)]
        for sock in sockets:
            sock.set_inheritable(True)  # as for the exec of the new server
        addresses = [sock.getsockname() for sock in sockets]
        server = PreforkServer(None)
        server.population = 2
        fds = ','.join(str(sock.detach()) for sock in sockets)
        with patch.dict(os.environ, {'ODOO_HTTP_WORKER_SOCKET_FDS': fds}), \
             patch.dict(config.options, {'gevent_workers': 0}):
            server.bind_worker_sockets()
        for sock in server.worker_sockets:
            self.addCleanup(sock.close)
        self.assertEqual([sock.getsockname() for sock in server.worker_sockets], addresses)
        self.assertFalse(any(sock.get_inheritable() for sock in server.worker_sockets))
        self.assertEqual(server.free_slots, {0, 1})

    def test_gevent_port_among_the_worker_ports(self):
        server = PreforkServer(None)
        server.port, server.population = 8069, 4
        with patch.dict(config.options, {'gevent_workers': 1, 'gevent_port': 8072}), \
             self.assertRaises(SystemExit):
            server.bind_worker_sockets()
