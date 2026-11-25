# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tests import tagged
from odoo.tests.common import TransactionCase


@tagged('post_install', '-at_install')
class TestPosPaymentAttempt(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.payment_method = cls.env['pos.payment.method'].create({'name': 'Terminal', 'type': 'bank'})

    def _line(self, transaction_id):
        return self.env['pos.payment.attempt'].search([('transaction_id', '=', transaction_id)])

    def test_one_line_per_transaction(self):
        log = self.payment_method._log_terminal_transaction
        log('TX1', 'processing', amount=10.0, order_uuid='unknown-order')
        log('TX1', 'failed', message='Declined')
        line = self._line('TX1')
        self.assertEqual(len(line), 1)
        self.assertEqual((line.state, line.amount, line.message), ('failed', 10.0, 'Declined'))
        self.assertFalse(line.pos_order_id)

        # A late update doesn't reopen a final status; only a success can replace it.
        log('TX1', 'processing')
        self.assertEqual(line.state, 'failed')
        log('TX1', 'success')
        self.assertEqual(line.state, 'success')

        log('TX2', 'processing')
        self.assertEqual(len(self._line('TX2')), 1)
        log(False, 'processing')
        self.assertEqual(self.env['pos.payment.attempt'].search_count([('payment_method_id', '=', self.payment_method.id)]), 2)
