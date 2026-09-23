# Part of Odoo. See LICENSE file for full copyright and licensing details.
import json
from unittest.mock import patch

import requests

from odoo.addons.account.tests.test_account_move_send import TestAccountMoveSendCommon
from odoo.addons.l10n_cn_edi_nuonuo.tools import sign

APP_KEY = 'test-app-key'
APP_SECRET = 'test-app-secret'
TOKEN = 'test-token'


class MockResponse:

    def __init__(self, body, status=200):
        self.body = body
        self.status_code = status

    def raise_for_status(self):
        if self.status_code >= 400:
            error = f"HTTP {self.status_code}"
            raise requests.HTTPError(error)

    def json(self):
        return self.body


class MockNuonuo:
    """Stands in for sdk.nuonuo.com: checks each signature like the gateway, then answers per method."""

    def __init__(self):
        self.handlers = {}
        self.requests = []
        self.unreachable = False

    def __call__(self, url, params=None, data=None, headers=None, timeout=None):
        if self.unreachable:
            error = "DNS failure"
            raise requests.ConnectionError(error)
        content = data.decode()
        self.requests.append({'url': url, 'params': params, 'headers': headers, 'payload': json.loads(content)})
        expected = sign(APP_SECRET, params['appkey'], params['senid'], params['nonce'], params['timestamp'], content)
        if params['appkey'] != APP_KEY or headers['X-Nuonuo-Sign'] != expected:
            return MockResponse({'code': '070101', 'describe': '获取app密钥失败或appkey无效'})
        handler = self.handlers.get(headers['method'])
        if handler is None:
            return MockResponse({'code': 'E9500', 'describe': '发票不存在'})
        return handler(json.loads(content)) if callable(handler) else handler


class L10nCnEdiNuonuoTestCommon(TestAccountMoveSendCommon):

    @classmethod
    @TestAccountMoveSendCommon.setup_country('cn')
    def setUpClass(cls):
        super().setUpClass()
        cls.company = cls.company_data['company']
        cls.company.write({
            'vat': '91310115MA1K39423D',
            'l10n_cn_edi_nuonuo_app_key': APP_KEY,
            'l10n_cn_edi_nuonuo_app_secret': APP_SECRET,
            'l10n_cn_edi_nuonuo_token': TOKEN,
            'l10n_cn_edi_nuonuo_extension_number': '923',
        })

    def setUp(self):
        super().setUp()
        self.nuonuo = MockNuonuo()
        patch('odoo.addons.l10n_cn_edi_nuonuo.tools.nuonuo_client.requests.post', self.nuonuo).start()
        self.addCleanup(patch.stopall)
