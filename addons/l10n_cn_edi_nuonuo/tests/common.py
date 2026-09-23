# Part of Odoo. See LICENSE file for full copyright and licensing details.
import json
from unittest.mock import patch

import requests

from odoo.addons.account.tests.test_account_move_send import TestAccountMoveSendCommon
from odoo.addons.l10n_cn_edi_nuonuo.tools import NuonuoClient, sign

APP_KEY = 'test-app-key'
APP_SECRET = 'test-app-secret'
TOKEN = 'test-token'


class MockResponse:

    def __init__(self, body=None, status=200, content=b''):
        self.body = body
        self.status_code = status
        self.content = content

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
        cls.partner_a.write({'country_id': cls.env.ref('base.cn').id, 'vat': '91330106MA2B2ABCDN'})
        tax_category = cls.env['l10n_cn_edi.tax.category'].sudo().create({'name': 'Test', 'code': '1090511030000000000'})
        (cls.product_a + cls.product_b).product_tmpl_id.l10n_cn_tax_category_id = tax_category

    def setUp(self):
        super().setUp()
        self.nuonuo = MockNuonuo()
        self.downloads = {}
        patch('odoo.addons.l10n_cn_edi_nuonuo.tools.nuonuo_client.requests.post', self.nuonuo).start()
        patch(
            'odoo.addons.l10n_cn_edi_nuonuo.tools.nuonuo_client.requests.get',
            lambda url, timeout=None: MockResponse(content=self.downloads[url]) if url in self.downloads else MockResponse(status=404),
        ).start()
        patch.object(NuonuoClient, '_wait', lambda client, seconds: None).start()
        self.addCleanup(patch.stopall)

    def _answer(self, method, *responses):
        """Answer ``method`` with each body in turn, repeating the last one."""
        queue = list(responses)

        def handler(payload):
            return MockResponse(queue.pop(0) if len(queue) > 1 else queue[0])
        self.nuonuo.handlers[method] = handler

    def _requests_for(self, method):
        return [request for request in self.nuonuo.requests if request['headers']['method'] == method]
