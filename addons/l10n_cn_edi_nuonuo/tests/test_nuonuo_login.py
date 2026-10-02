# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo.exceptions import UserError
from odoo.tests import tagged

from .common import L10nCnEdiNuonuoTestCommon, MockResponse

STATUS = 'nuonuo.OpeMplatform.getCertificationStatus'
QR_CODE = 'nuonuo.OpeMplatform.getQrCode'
VERIFY = 'nuonuo.OpeMplatform.verifyComplete'
ISSUE = 'nuonuo.OpeMplatform.requestBillingNew'
QR = {'code': 'E0000', 'result': {
    'status': '1',
    'qrCode': 'qrcode_id=oc8G912345y58oeIgkKNNJ0utp6vEi1r4&areaPrefix=4400&interfaceCode=0002',
    'qrCodeType': '4',
    'authId': 'auth-1',
    'endTime': '2026-09-25 10:05:00',
}}
NO_QR = {'code': 'E0000', 'result': {'status': '0', 'message': '获取二维码中'}}
OK = {'code': 'E0000', 'describe': '请求成功'}


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestNuonuoLogin(L10nCnEdiNuonuoTestCommon):

    def setUp(self):
        super().setUp()
        self.invoice = self.init_invoice('out_invoice', partner=self.partner_a, products=self.product_a, taxes=self.tax_sale_a)
        self.invoice.action_post()

    def _by_query_type(self, method, answers):
        """Answer ``method`` per queryType, each with its bodies in turn, repeating the last one."""
        queues = {query_type: list(bodies) for query_type, bodies in answers.items()}

        def handler(payload):
            queue = queues[payload['queryType']]
            return MockResponse(queue.pop(0) if len(queue) > 1 else queue[0])
        self.nuonuo.handlers[method] = handler

    def _query_types(self, method):
        return [request['payload']['queryType'] for request in self._requests_for(method)]

    def _open_login(self):
        action = self.invoice.action_l10n_cn_edi_login()
        self.assertEqual(action['res_model'], 'l10n_cn_edi_nuonuo.login')
        return self.env['l10n_cn_edi_nuonuo.login'].browse(action['res_id'])

    # ------------------------------------------------------------------
    # Session state
    # ------------------------------------------------------------------

    def test_logged_out_drawer_holds_the_send(self):
        self._set_session(login='0', identity='1')

        error = self._issue(self.invoice)

        self.assertIn("logged out of the tax bureau", error)
        self.assertEqual(self.invoice.l10n_cn_edi_state, 'waiting_login')
        self.assertFalse(self._requests_for(ISSUE))
        # The login status goes first, and is enough.
        self.assertEqual(self._query_types(STATUS), ['2'])

    def test_pending_identity_check_holds_the_send(self):
        self._set_session(login='1', identity='2')

        self.assertIn("实名认证", self._issue(self.invoice))
        self.assertEqual(self.invoice.l10n_cn_edi_state, 'waiting_login')
        self.assertEqual(self._query_types(STATUS), ['2', '1'])

    def test_unknown_session_does_not_hold_the_send(self):
        self.nuonuo.handlers[STATUS] = MockResponse({'code': 'E9999', 'describe': '系统繁忙'})

        with self.assertLogs('odoo.addons.l10n_cn_edi_nuonuo.tools.nuonuo_client', 'WARNING'):
            self.assertEqual(self.company._l10n_cn_edi_get_client().get_session_state(), 'ok')

    # ------------------------------------------------------------------
    # Identity check (实名认证)
    # ------------------------------------------------------------------

    def test_identity_check_shows_nuonuo_s_code_without_renewing_it(self):
        self._set_session(login='1', identity='2')
        self._by_query_type(QR_CODE, {'1': [QR]})

        wizard = self._open_login()

        self.assertRecordValues(wizard, [{
            'purpose': 'verify',
            'qr_code': QR['result']['qrCode'],
            'qr_app': "the tax bureau app (税务 APP)",
            'auth_id': 'auth-1',
        }])
        self.assertIn('barcode_type=QR', wizard.qr_image_url)
        self.assertEqual(self._query_types(QR_CODE), ['1'])

    def test_identity_check_renews_a_missing_code(self):
        self._set_session(login='1', identity='2')
        self._by_query_type(QR_CODE, {'1': [NO_QR, NO_QR, QR], '0': [OK]})

        wizard = self._open_login()

        self.assertEqual(wizard.qr_code, QR['result']['qrCode'])
        self.assertEqual(self._query_types(QR_CODE), ['1', '0', '1', '1'])

    def test_confirmed_identity_sends_the_invoice_again(self):
        self._set_session(login='1', identity='2')
        self._by_query_type(QR_CODE, {'1': [QR]})
        wizard = self._open_login()

        self._set_session(login='1', identity='1')
        action = wizard.action_confirm()

        refresh = next(request['payload'] for request in self._requests_for(STATUS) if request['payload']['queryType'] == '0')
        self.assertEqual(refresh['authId'], 'auth-1')
        self.assertEqual(action['res_model'], 'account.move.send.wizard')
        self.assertEqual(action['context']['active_ids'], self.invoice.ids)

    def test_unconfirmed_identity_keeps_the_wizard_open(self):
        self._set_session(login='1', identity='2')
        self._by_query_type(QR_CODE, {'1': [QR]})
        wizard = self._open_login()

        with self.assertRaisesRegex(UserError, "hasn't confirmed yet"):
            wizard.action_confirm()

    # ------------------------------------------------------------------
    # Login
    # ------------------------------------------------------------------

    def test_scan_login_then_identity_check(self):
        self._set_session(login='0', identity='2')
        wizard = self._open_login()
        self.assertEqual(wizard.purpose, 'login')
        self.assertFalse(wizard.qr_code, "Logging in may go by SMS: no code is fetched before the drawer picks")

        self._by_query_type(QR_CODE, {'3': [QR], '1': [QR]})
        wizard.action_show_qr_code()
        self._by_query_type(VERIFY, {'0': [OK], '1': [{'code': 'E0000', 'result': {'status': '0'}}, {'code': 'E0000', 'result': {'status': '1'}}]})
        self._set_session(login='1', identity='2')
        action = wizard.action_confirm()

        self.assertEqual(self._query_types(VERIFY), ['0', '1', '1'])
        next_wizard = self.env['l10n_cn_edi_nuonuo.login'].browse(action['res_id'])
        self.assertEqual((next_wizard.purpose, next_wizard.invoice_ids), ('verify', self.invoice))

    def test_sms_login(self):
        self._set_session(login='0', identity='1')
        wizard = self._open_login()
        wizard.method = 'sms'
        self._by_query_type(QR_CODE, {'4': [OK]})
        wizard.action_send_sms()
        self.assertTrue(wizard.sms_sent)

        self._by_query_type(VERIFY, {'2': [OK], '3': [{'code': 'E0000', 'result': {'status': '1'}}]})
        self._set_session(login='1', identity='1')
        wizard.sms_code = ' 123456 '
        wizard.action_confirm()

        submitted = self._requests_for(VERIFY)[0]['payload']
        self.assertEqual((submitted['queryType'], submitted['verifyCode']), ('2', 123456))

    def test_sms_login_send_refusal_is_reported(self):
        self._set_session(login='0', identity='1')
        wizard = self._open_login()
        wizard.method = 'sms'
        self._by_query_type(QR_CODE, {'4': [{'code': 'E9999', 'describe': '短信发送失败'}]})

        with self.assertRaisesRegex(UserError, '短信发送失败'):
            wizard.action_send_sms()

    def test_refused_login_is_reported(self):
        self._set_session(login='0', identity='1')
        wizard = self._open_login()
        self._by_query_type(QR_CODE, {'3': [QR]})
        wizard.action_show_qr_code()
        self._by_query_type(VERIFY, {'0': [OK], '1': [{'code': 'E0000', 'result': {'status': '2', 'message': '二维码已过期'}}]})

        with self.assertRaisesRegex(UserError, '二维码已过期'):
            wizard.action_confirm()

    def test_login_from_settings_when_already_logged_in(self):
        settings = self.env['res.config.settings'].create({'company_id': self.company.id})

        action = settings.action_l10n_cn_edi_nuonuo_login()

        self.assertEqual(action['tag'], 'display_notification')
