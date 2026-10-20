# Part of Odoo. See LICENSE file for full copyright and licensing details.

from unittest.mock import MagicMock, patch

import odoo.tests
from odoo import Command
from odoo.exceptions import UserError, ValidationError

from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo.addons.pos_viva_com.models.pos_payment_method import PosPaymentMethod


@odoo.tests.tagged('post_install', '-at_install')
class TestVivaComBearerTokenAcl(AccountTestInvoicingCommon):

    _test_user_groups = None  # FIXME list needed groups

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        bank_journal = cls.company_data['default_journal_bank']
        # Only POS administrators may create payment methods (Odoo 19+); test data is not the ACL under test.
        cls.viva_pm = cls.env['pos.payment.method'].sudo().create({
            'name': 'Viva ACL Test',
            'journal_id': bank_journal.id,
            'type': 'bank',
            'payment_method_type': 'terminal',
            'payment_provider': 'viva_com',
            'viva_com_merchant_id': 'm',
            'viva_com_api_key': 'k',
            'viva_com_client_id': 'test-client-id',
            'viva_com_client_secret': 'test-client-secret',
            'terminal_ids': [
                Command.create({'viva_com_terminal_id': '01234543210'}),
                Command.create({'viva_com_terminal_id': '98765456789'}),
            ],
        })
        cls.terminal_1, cls.terminal_2 = cls.viva_pm.terminal_ids
        cls.pos_user = cls.env['res.users'].create({
            'name': 'Pos Only User ACL',
            'login': 'pos_viva_acl_test',
            'password': 'pos_viva_acl_test',
            'group_ids': [(6, 0, [
                cls.env.ref('base.group_user').id,
                cls.env.ref('point_of_sale.group_pos_user').id,
            ])],
        })

    def test_bearer_token_persists_for_pos_user(self):
        """Test POS user can use Viva.com payment method"""
        mock_resp = MagicMock()
        mock_resp.json.return_value = {'access_token': 'refreshed-token'}
        mock_session = MagicMock()
        mock_session.post.return_value = mock_resp

        self.viva_pm.with_user(self.pos_user)._bearer_token(mock_session)

        self.assertEqual(self.viva_pm.viva_com_bearer_token, 'refreshed-token')

    def _mock_call_viva_com(self):
        return patch.object(PosPaymentMethod, '_call_viva_com', autospec=True, return_value={})

    def test_payment_request_uses_terminal(self):
        with self._mock_call_viva_com() as mock_call:
            self.viva_pm.with_user(self.pos_user).viva_com_send_payment_request({'sessionId': 'abc'}, self.terminal_2.id)
            payment_method, endpoint, action, data = mock_call.call_args.args

        self.assertEqual(payment_method, self.viva_pm)
        self.assertEqual(endpoint, 'transactions:sale')
        self.assertEqual(action, 'post')
        self.assertEqual(data, {'sessionId': 'abc', 'terminalId': '98765456789'})

    def test_payment_request_without_terminal(self):
        # e.g. from the Self Order Kiosk, the first terminal is used
        with self._mock_call_viva_com() as mock_call:
            self.viva_pm.with_user(self.pos_user).viva_com_send_payment_request({'sessionId': 'abc'})
            data = mock_call.call_args.args[3]

        self.assertEqual(data['terminalId'], '01234543210')

    def test_payment_request_with_unknown_terminal(self):
        other_terminal = self.viva_pm.copy().terminal_ids[0]
        with self._mock_call_viva_com(), self.assertRaises(ValidationError):
            self.viva_pm.with_user(self.pos_user).viva_com_send_payment_request({'sessionId': 'abc'}, other_terminal.id)

    def test_refund_request_uses_terminal(self):
        with self._mock_call_viva_com() as mock_call:
            self.viva_pm.with_user(self.pos_user).viva_com_send_refund_request({'sessionId': 'abc', 'parentSessionId': 'def'}, self.terminal_2.id)
            endpoint, data = mock_call.call_args.args[1], mock_call.call_args.args[3]
        self.assertEqual(endpoint, 'transactions:refund')
        self.assertEqual(data['terminalId'], '98765456789')

        with self._mock_call_viva_com() as mock_call:
            self.viva_pm.with_user(self.pos_user).viva_com_send_refund_request({'sessionId': 'abc'}, self.terminal_2.id)
            endpoint, data = mock_call.call_args.args[1], mock_call.call_args.args[3]
        self.assertEqual(endpoint, 'transactions:unreferenced-refund')
        self.assertEqual(data['terminalId'], '98765456789')

    def test_terminal_required(self):
        with self.assertRaises(ValidationError):
            self.viva_pm.terminal_ids = [Command.clear()]
        with self.assertRaises(UserError):
            self.viva_pm.terminal_ids = [Command.update(self.terminal_2.id, {'viva_com_terminal_id': False})]
