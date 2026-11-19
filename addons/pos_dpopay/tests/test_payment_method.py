# Part of Odoo. See LICENSE file for full copyright and licensing details.

from unittest.mock import Mock, patch

from requests.exceptions import ConnectionError as RequestsConnectionError

from odoo.exceptions import UserError
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
            'dpopay_tid': 'TESTTID',
        }
        cls.payment_methods = cls.env['pos.payment.method'].create([
            {
                'name': 'DPO Pay Card',
                'dpopay_payment_mode': 'card',
                **common_field,
            },
            {
                'name': 'DPO Pay Mobile Money',
                'dpopay_payment_mode': 'momo',
                **common_field,
            },
        ])

    def _mock_post(self, url, json=None, **kwargs):
        self.payload = json
        response = Mock()
        response.json.return_value = {'resultCode': '0'}
        return response

    def test_send_dpopay_request_sets_transaction_type(self):
        with patch('odoo.addons.pos_dpopay.models.pos_payment_method.requests.post', self._mock_post):
            for payment_method, transaction_type in zip(self.payment_methods, ('pushPaymentSale', 'pushPaymentDpoMomoSale')):
                payment_method.send_dpopay_request({'amount': 100}, 'start-transaction')
                self.assertEqual(self.payload['transactionType'], transaction_type)

    def _patch_post(self, response_json=None, side_effect=None):
        response = Mock(status_code=200)
        response.json.return_value = response_json
        return patch(
            'odoo.addons.pos_dpopay.models.pos_payment_method.requests.post',
            return_value=response,
            side_effect=side_effect,
        )

    def test_terminal_status(self):
        payment_method = self.payment_methods[0]
        cases = [
            ({'displayText': 'NO TXN / SYSTEM IDLE'}, 'ready'),
            ({'displayText': 'TXN IN PROGRESS'}, 'busy'),
        ]
        for response_json, expected_status in cases:
            with self.subTest(expected_status=expected_status), self._patch_post(response_json):
                self.assertEqual(payment_method.get_dpopay_terminal_status()['status'], expected_status)

        with self._patch_post(side_effect=RequestsConnectionError('Connection refused')):
            terminal_status = payment_method.get_dpopay_terminal_status()
        self.assertEqual(terminal_status, {'status': 'error', 'message': 'Connection refused'})

    def test_action_test_terminal(self):
        payment_method = self.payment_methods[0]
        cases = [
            ({'displayText': 'NO TXN / SYSTEM IDLE'}, 'success'),
            ({'displayText': 'TXN IN PROGRESS'}, 'warning'),
        ]
        for response_json, notification_type in cases:
            with self.subTest(notification_type=notification_type), self._patch_post(response_json):
                action = payment_method.action_dpopay_test_terminal()
                self.assertEqual(action['tag'], 'display_notification')
                self.assertEqual(action['params']['type'], notification_type)

        with self._patch_post(side_effect=RequestsConnectionError('Connection refused')), self.assertRaises(UserError):
            payment_method.action_dpopay_test_terminal()
