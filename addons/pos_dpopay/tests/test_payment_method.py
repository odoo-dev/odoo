# Part of Odoo. See LICENSE file for full copyright and licensing details.

from unittest.mock import Mock, patch

from odoo import Command
from odoo.exceptions import ValidationError
from odoo.tests import tagged
from odoo.tests.common import TransactionCase


@tagged('post_install', '-at_install')
class TestPosDpoPayPaymentMethod(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        common_field = {
            'type': 'bank',
            'payment_provider': 'dpopay',
            'dpopay_test_mode': True,
            'dpopay_mid': '123456789012',
        }
        cls.payment_methods = cls.env['pos.payment.method'].create([
            {
                'name': 'DPO Pay Card',
                'dpopay_payment_mode': 'card',
                'terminal_ids': [
                    Command.create({'dpopay_tid': 'TESTTID1'}),
                    Command.create({'dpopay_tid': 'TESTTID2'}),
                ],
                **common_field,
            },
            {
                'name': 'DPO Pay Mobile Money',
                'dpopay_payment_mode': 'momo',
                'terminal_ids': [Command.create({'dpopay_tid': 'TESTTID3'})],
                **common_field,
            },
        ])

    def _mock_post(self, url, json=None, **kwargs):
        self.url = url
        self.payload = json
        response = Mock()
        response.json.return_value = {'resultCode': '0'}
        return response

    def test_send_dpopay_request_sets_transaction_type(self):
        with patch('odoo.addons.pos_dpopay.models.pos_payment_method.requests.post', self._mock_post):
            for payment_method, transaction_type in zip(self.payment_methods, ('pushPaymentSale', 'pushPaymentDpoMomoSale')):
                payment_method.send_dpopay_request({'amount': 100}, 'start-transaction')
                self.assertEqual(self.payload['transactionType'], transaction_type)

    def test_send_dpopay_request_uses_terminal(self):
        payment_method = self.payment_methods[0]
        terminal_1, terminal_2 = payment_method.terminal_ids
        with patch('odoo.addons.pos_dpopay.models.pos_payment_method.requests.post', self._mock_post):
            payment_method.send_dpopay_request({'amount': 100}, 'start-transaction', terminal_2.id)
            self.assertEqual(self.url, 'https://api-dev.network.global/ngenius-webapi/payments/push/v1/tid:TESTTID2/mid:123456789012/start-transaction')

            payment_method.send_dpopay_request({}, 'get-status', terminal_1.id)
            self.assertIn('/tid:TESTTID1/mid:123456789012/get-status', self.url)

            # Without a terminal (e.g. Self Order Kiosk), the first terminal is used
            payment_method.send_dpopay_request({}, 'cancel-transaction')
            self.assertIn('/tid:TESTTID1/mid:123456789012/cancel-transaction', self.url)

    def test_send_dpopay_request_with_unknown_terminal(self):
        other_terminal = self.payment_methods[1].terminal_ids
        with (
            patch('odoo.addons.pos_dpopay.models.pos_payment_method.requests.post', self._mock_post),
            self.assertRaises(ValidationError),
        ):
            self.payment_methods[0].send_dpopay_request({}, 'get-status', other_terminal.id)

    def test_terminal_required(self):
        with self.assertRaises(ValidationError):
            self.payment_methods[0].terminal_ids = [Command.clear()]
