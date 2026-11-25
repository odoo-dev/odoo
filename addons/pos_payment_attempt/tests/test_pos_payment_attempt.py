# Part of Odoo. See LICENSE file for full copyright and licensing details.

from unittest.mock import patch

from odoo.tests import tagged
from odoo.tests.common import TransactionCase

from odoo.addons.pos_payment_attempt.models.pos_payment import PosPayment


@tagged('post_install', '-at_install')
class TestPosPaymentAttempt(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.payment_method = cls.env['pos.payment.method'].create({'name': 'Terminal', 'type': 'bank'})
        cls.PosPayment = cls.env['pos.payment']

    def _log(self, **values):
        with patch.object(PosPayment, '_get_terminal_transaction_log_values', return_value=values):
            return self.PosPayment._log_terminal_transaction(self.payment_method, {}, {})

    def test_base_hook_logs_nothing(self):
        self.PosPayment._log_terminal_transaction(self.payment_method, {'sourceId': 'TX'}, {})
        self.assertFalse(self.env['pos.payment.attempt'].search([('payment_method_id', '=', self.payment_method.id)]))

    def test_one_line_per_transaction(self):
        line = self._log(transaction_id='TX1', state='processing', amount=10.0)
        self.assertEqual(self._log(transaction_id='TX1', state='failed', message='Declined'), line)
        self.assertEqual((line.state, line.amount, line.message), ('failed', 10.0, 'Declined'))

        # A late update doesn't reopen a final status; only a success can replace it.
        self._log(transaction_id='TX1', state='processing')
        self.assertEqual(line.state, 'failed')
        self._log(transaction_id='TX1', state='success')
        self.assertEqual(line.state, 'success')
        self.assertEqual(len(self._log(transaction_id='TX2', state='processing') | line), 2)
