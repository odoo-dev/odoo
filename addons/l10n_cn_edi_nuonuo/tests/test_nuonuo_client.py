# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo.exceptions import UserError
from odoo.tests import tagged

from .common import APP_KEY, TOKEN, L10nCnEdiNuonuoTestCommon, MockResponse
from odoo.addons.l10n_cn_edi_nuonuo.tools import sign


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestNuonuoClient(L10nCnEdiNuonuoTestCommon):

    def test_signature_matches_the_live_gateway(self):
        # Worked out against sdk.nuonuo.com on 2026-09-22: this exact input got past the gateway's check.
        self.assertEqual(
            sign('SECRET', 'APPKEY', 'SENID', '12345678', '1700000000', '{"a":1}'),
            '7iSZiR+0g+376QEJ38xLM+3vGDs=',
        )

    def test_request_is_signed_and_addressed(self):
        self.company._l10n_cn_edi_get_client().test_connection()

        request = self.nuonuo.requests[-1]
        self.assertEqual(request['url'], 'https://sdk.nuonuo.com/open/v1/services')
        self.assertEqual(request['params']['appkey'], APP_KEY)
        self.assertEqual(request['headers']['method'], 'nuonuo.OpeMplatform.queryInvoiceResult')
        self.assertEqual(request['headers']['accessToken'], TOKEN)
        self.assertEqual(request['headers']['userTax'], self.company.vat)

    def test_chinese_payloads_are_signed_as_sent(self):
        client = self.company._l10n_cn_edi_get_client()
        self.nuonuo.handlers['nuonuo.OpeMplatform.echo'] = lambda payload: MockResponse({'code': 'E0000', 'result': payload})

        body = client._call('nuonuo.OpeMplatform.echo', {'buyerName': '深圳市华夏光电子有限公司'})

        self.assertEqual(body['code'], 'E0000')
        self.assertEqual(body['result']['buyerName'], '深圳市华夏光电子有限公司')

    def test_wrong_secret_is_reported_as_a_credential_problem(self):
        self.company.l10n_cn_edi_nuonuo_app_secret = 'not-the-secret'

        with self.assertRaisesRegex(UserError, '070101'):
            self.company._l10n_cn_edi_get_client().test_connection()

    def test_network_failure_is_a_user_error(self):
        self.nuonuo.unreachable = True

        with self.assertRaisesRegex(UserError, "Could not reach Nuonuo"):
            self.company._l10n_cn_edi_get_client().test_connection()

    def test_unexpected_answer_fails_the_connection_test(self):
        self.nuonuo.handlers['nuonuo.OpeMplatform.queryInvoiceResult'] = MockResponse({'code': 'E9999', 'describe': '系统繁忙'})

        with self.assertRaisesRegex(UserError, 'E9999'):
            self.company._l10n_cn_edi_get_client().test_connection()

    def test_readiness_needs_every_credential(self):
        self.assertTrue(self.company._l10n_cn_edi_is_ready())
        self.company.l10n_cn_edi_nuonuo_token = False
        self.assertFalse(self.company._l10n_cn_edi_is_ready())
        with self.assertRaisesRegex(UserError, "Access Token"):
            self.company._l10n_cn_edi_get_client().ensure_ready()

    def test_an_accountant_can_use_the_admin_only_secrets(self):
        accountant = self.env['res.users'].create({
            'name': 'Accountant',
            'login': 'cn_edi_accountant',
            'group_ids': [(6, 0, [self.env.ref('account.group_account_invoice').id])],
            'company_id': self.company.id,
            'company_ids': [(6, 0, self.company.ids)],
        })
        company = self.company.with_user(accountant)

        self.assertTrue(company._l10n_cn_edi_is_ready())
        company._l10n_cn_edi_get_client().test_connection()
        self.assertEqual(self.nuonuo.requests[-1]['headers']['accessToken'], TOKEN)

    def test_credit_line_is_fetched_when_nuonuo_has_none(self):
        empty = {'code': 'E0000', 'result': {'requestStatus': '0', 'availableCreditLine': None}}
        known = {'code': 'E0000', 'result': {
            'requestStatus': '1',
            'availableCreditLine': '9000.12',
            'usedCreditLine': '1000.12',
            'totalCreditLine': '10000.24',
            'amountUpdateTime': '2026-09-25 09:12:20',
        }}
        answers = {'1': [empty, known], '0': [{'code': 'E0000'}]}
        self.nuonuo.handlers['nuonuo.OpeMplatform.getCreditLine'] = lambda payload: MockResponse(
            answers[payload['queryType']].pop(0) if len(answers[payload['queryType']]) > 1 else answers[payload['queryType']][0],
        )

        credit_line = self.company._l10n_cn_edi_get_client().get_credit_line()

        self.assertEqual(credit_line, {'available': 9000.12, 'used': 1000.12, 'total': 10000.24, 'updated': '2026-09-25 09:12:20'})
        query_types = [request['payload']['queryType'] for request in self.nuonuo.requests]
        self.assertEqual(query_types, ['1', '0', '1'])

    def test_credit_line_still_unknown_asks_to_retry(self):
        self.nuonuo.handlers['nuonuo.OpeMplatform.getCreditLine'] = MockResponse({'code': 'E0000', 'result': {'requestStatus': '0'}})

        with self.assertRaisesRegex(UserError, "still fetching"):
            self.env['res.config.settings'].create({'company_id': self.company.id}).action_l10n_cn_edi_nuonuo_credit_line()
