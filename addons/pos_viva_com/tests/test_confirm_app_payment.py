# Part of Odoo. See LICENSE file for full copyright and licensing details.

from unittest.mock import MagicMock, patch

import odoo.tests

from odoo.addons.point_of_sale.tests.common import CommonPosTest
from odoo.addons.pos_viva_com.models.pos_payment_method import PosPaymentMethod


@odoo.tests.tagged('post_install', '-at_install')
class TestVivaComConfirmAppPayment(CommonPosTest):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.viva_pm = cls.env['pos.payment.method'].create({
            'name': 'Viva',
            'type': 'bank',
            'journal_id': cls.company_data['default_journal_bank'].id,
            'payment_provider': 'viva_com',
            'viva_com_merchant_id': 'test-merchant-id',
            'viva_com_api_key': 'test-api-key',
            'viva_com_client_id': 'test-client-id',
            'viva_com_client_secret': 'test-client-secret',
            'viva_com_terminal_id': '01234543210',
        })
        cls.pos_config_usd.payment_method_ids |= cls.viva_pm
        product = cls.env['product.product'].create({'name': 'Loaf', 'lst_price': 10, 'taxes_id': False})
        order, _ = cls.create_backend_pos_order(cls, {'line_data': [{'product_id': product.id, 'qty': 1}]})
        cls.line = cls.env['pos.payment'].create({
            'pos_order_id': order.id,
            'payment_method_id': cls.viva_pm.id,
            'amount': 10,
            'payment_status': 'waitingCard',
            'viva_com_session_id': 'session-1',
        })

    def confirm(self, transactions, session_id='session-1'):
        calls = []

        def get_transaction(pm, transaction_id):
            calls.append(transaction_id)
            return transactions.pop(0) if transactions else {}

        with patch.object(PosPaymentMethod, '_viva_com_get_transaction', get_transaction), \
             patch('odoo.addons.pos_viva_com.models.pos_payment_method.time.sleep'):
            result = self.viva_pm.viva_com_confirm_app_payment(session_id, 'tx-1')
        return result, calls

    def test_confirmed_payment_is_written_on_the_line(self):
        result, calls = self.confirm([{'StatusId': 'F', 'MerchantTrns': 'session-1/7', 'Amount': 10.0, 'BankId': 'NET_VISA'}])

        self.assertEqual(result, {'success': True, 'transactionId': 'tx-1', 'cardType': 'NET_VISA'})
        self.assertEqual(calls, ['tx-1'])
        self.assertRecordValues(self.line, [{'payment_status': 'done', 'transaction_id': 'tx-1', 'card_type': 'NET_VISA'}])

    def test_transaction_visible_after_a_retry(self):
        result, calls = self.confirm([{}, {'StatusId': 'F', 'MerchantTrns': 'session-1/7', 'Amount': 10.0}])

        self.assertTrue(result.get('success'))
        self.assertEqual(calls, ['tx-1', 'tx-1'])

    def test_unknown_transaction_is_refused(self):
        result, calls = self.confirm([])

        self.assertEqual(result, {'error': 'Viva.com did not confirm the payment tx-1'})
        self.assertEqual(calls, ['tx-1', 'tx-1', 'tx-1'])
        self.assertEqual(self.line.payment_status, 'waitingCard')

    def test_transaction_of_another_session_or_amount_is_refused(self):
        for transaction in (
            {'StatusId': 'F', 'MerchantTrns': 'other-session/7', 'Amount': 10.0},
            {'StatusId': 'F', 'MerchantTrns': 'session-1/7', 'Amount': 9.5},
            {'StatusId': 'E', 'MerchantTrns': 'session-1/7', 'Amount': 10.0},
        ):
            result, _ = self.confirm([transaction])
            self.assertIn('error', result)
        self.assertEqual(self.line.payment_status, 'waitingCard')

    def test_transaction_id_is_encoded_in_the_url(self):
        session = MagicMock()
        session.get.return_value.status_code = 200
        session.get.return_value.json.return_value = {'Transactions': []}

        with patch('odoo.addons.pos_viva_com.models.pos_payment_method.get_viva_com_session', return_value=session):
            self.viva_pm._viva_com_get_transaction('../orders?ordercode=1')

        self.assertTrue(session.get.call_args.args[0].endswith('/api/transactions/..%2Forders%3Fordercode%3D1'))

    def test_unknown_session_is_refused_without_calling_viva(self):
        result, calls = self.confirm([], session_id='missing')

        self.assertEqual(result, {'error': 'Payment missing not found'})
        self.assertEqual(calls, [])
