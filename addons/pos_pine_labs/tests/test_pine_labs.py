from unittest.mock import patch

from requests import Response

from odoo import Command
from odoo.exceptions import ValidationError
from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestPineLabsPosRequest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env.company.currency_id = cls.env.ref('base.INR')
        cls.env['ir.config_parameter'].set_str('pos_pine_labs.pine_labs_proxy_endpoint', 'https://pine-labs.test/')
        cls.payment_method = cls.env['pos.payment.method'].create({
            'name': 'Pine Labs',
            'type': 'bank',
            'payment_method_type': 'terminal',
            'payment_provider': 'pine_labs',
            'pine_labs_merchant': 'my_merchant',
            'pine_labs_security_token': 'my_security_token',
            'pine_labs_allowed_payment_mode': 'card',
            'pine_labs_test_mode': True,
            'terminal_ids': [
                Command.create({'pine_labs_store': 'my_store', 'pine_labs_client': 'my_client'}),
                Command.create({'pine_labs_store': 'my_store_2', 'pine_labs_client': 'my_client_2'}),
            ],
        })
        cls.terminal_1, cls.terminal_2 = cls.payment_method.terminal_ids

    def _mock_pine_labs(self, payload):
        """ Patch the Pine Labs requests and record the calls they make. """
        calls = []

        def mock_post(url, **kwargs):
            calls.append({'url': url, 'json': kwargs.get('json', {})})
            response = Response()
            response.status_code = 200
            response.json = lambda: payload
            return response

        return calls, patch('odoo.addons.pos_pine_labs.models.pine_labs_pos_request.requests.post', mock_post)

    def test_payment_request_uses_first_terminal_by_default(self):
        calls, mocked = self._mock_pine_labs({
            'ResponseCode': 0,
            'ResponseMessage': 'APPROVED',
            'PlutusTransactionReferenceID': 123,
        })
        with mocked:
            result = self.payment_method.pine_labs_make_payment_request({
                'amount': 10000,
                'transactionNumber': 'Shop/ORDER0001',
                'sequenceNumber': 1,
            })

        self.assertEqual(result, {'responseCode': 0, 'status': 'APPROVED', 'plutusTransactionReferenceID': 123})
        self.assertEqual(calls[0]['url'], 'https://pine-labs.test/UploadBilledTransaction')
        self.assertEqual(calls[0]['json'], {
            'Amount': 10000,
            'TransactionNumber': 'Shop/ORDER0001',
            'SequenceNumber': 1,
            'MerchantID': 'my_merchant',
            'StoreID': 'my_store',
            'ClientID': 'my_client',
            'SecurityToken': 'my_security_token',
            'AllowedPaymentMode': 1,
            'AutoCancelDurationInMinutes': 10,
        })

    def test_requests_are_sent_to_given_terminal(self):
        calls, mocked = self._mock_pine_labs({'ResponseCode': 0, 'ResponseMessage': 'APPROVED', 'PlutusTransactionReferenceID': 123})
        with mocked:
            self.payment_method.pine_labs_make_payment_request({
                'amount': 10000,
                'transactionNumber': 'Shop/ORDER0001',
                'sequenceNumber': 1,
            }, self.terminal_2.id)
            self.payment_method.pine_labs_cancel_payment_request({
                'amount': 10000,
                'plutusTransactionReferenceID': 123,
            }, self.terminal_2.id)

        for call in calls:
            self.assertEqual(call['json']['StoreID'], 'my_store_2')
            self.assertEqual(call['json']['ClientID'], 'my_client_2')
            self.assertEqual(call['json']['MerchantID'], 'my_merchant')

        calls, mocked = self._mock_pine_labs({
            'ResponseCode': 0,
            'ResponseMessage': 'TXN APPROVED',
            'PlutusTransactionReferenceID': 123,
            'TransactionData': [{'Tag': 'ApprovalCode', 'Value': '00'}],
        })
        with mocked:
            result = self.payment_method.pine_labs_fetch_payment_status({'plutusTransactionReferenceID': 123}, self.terminal_2.id)

        self.assertEqual(result['data'], {'ApprovalCode': '00'})
        self.assertEqual(calls[0]['json']['ClientID'], 'my_client_2')

    def test_payment_request_with_unknown_terminal(self):
        other_terminal = self.env['pos.payment.terminal'].create({'payment_method_id': self.env['pos.payment.method'].create({'name': 'Bank', 'type': 'bank'}).id})
        _calls, mocked = self._mock_pine_labs({})
        with mocked, self.assertRaises(ValidationError):
            self.payment_method.pine_labs_fetch_payment_status({'plutusTransactionReferenceID': 123}, other_terminal.id)

    def test_payment_method_requires_terminal(self):
        with self.assertRaises(ValidationError):
            self.payment_method.terminal_ids = [Command.clear()]
