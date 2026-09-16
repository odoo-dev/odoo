# Part of Odoo. See LICENSE file for full copyright and licensing details.
from datetime import datetime, timedelta
from http import HTTPStatus

from odoo.http.router import API_KEY_READONLY_PREFIX
from odoo.tests import new_test_user, tagged

from .test_common import TestHttpBase


@tagged('-at_install', 'post_install')
class TestBearerScope(TestHttpBase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        expiration = datetime.now() + timedelta(hours=12)
        test_user = new_test_user(cls.env, 'test')
        test_user = test_user.with_user(test_user)
        cls.rpc_key = test_user.env['res.users.apikeys']._generate('rpc', 'test rpc key', expiration)
        cls.other_key = test_user.env['res.users.apikeys']._generate('other_scope', 'test other key', expiration)
        cls.readonly_key = test_user.env['res.users.apikeys']._generate('rpc', 'test readonly key', expiration, readonly=True)

    def test_rpc_key_works_on_rpc_endpoint(self):
        res = self.db_url_open('/test_http/greeting-bearer', headers={'Authorization': f'Bearer {self.rpc_key}'})
        self.assertEqual(res.status_code, HTTPStatus.OK)

    def test_rpc_key_rejected_on_non_rpc_endpoint(self):
        res = self.db_url_open('/test_http/greeting-bearer-other-scope', headers={'Authorization': f'Bearer {self.rpc_key}'})
        self.assertEqual(res.status_code, HTTPStatus.UNAUTHORIZED)

    def test_non_rpc_key_rejected_on_rpc_endpoint(self):
        res = self.db_url_open('/test_http/greeting-bearer', headers={'Authorization': f'Bearer {self.other_key}'})
        self.assertEqual(res.status_code, HTTPStatus.UNAUTHORIZED)

    def test_readonly_key_can_read(self):
        res = self.db_url_open('/test_http/greeting-bearer', headers={'Authorization': f'Bearer {self.readonly_key}'})
        self.assertEqual(res.status_code, HTTPStatus.OK)

    def test_readonly_key_cannot_write(self):
        res = self.db_url_open('/test_http/greeting-bearer-write', headers={'Authorization': f'Bearer {self.readonly_key}'})
        self.assertEqual(res.status_code, HTTPStatus.FORBIDDEN)

    def test_rpc_key_can_write(self):
        res = self.db_url_open('/test_http/greeting-bearer-write', headers={'Authorization': f'Bearer {self.rpc_key}'})
        self.assertEqual(res.status_code, HTTPStatus.OK)

    def test_readonly_key_rejected_without_prefix(self):
        bare_key = self.readonly_key.removeprefix(API_KEY_READONLY_PREFIX)
        res = self.db_url_open('/test_http/greeting-bearer', headers={'Authorization': f'Bearer {bare_key}'})
        self.assertEqual(res.status_code, HTTPStatus.UNAUTHORIZED)

    def test_rpc_key_rejected_with_readonly_prefix(self):
        res = self.db_url_open(
            '/test_http/greeting-bearer',
            headers={'Authorization': f'Bearer {API_KEY_READONLY_PREFIX}{self.rpc_key}'},
        )
        self.assertEqual(res.status_code, HTTPStatus.UNAUTHORIZED)
