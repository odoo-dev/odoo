# Part of Odoo. See LICENSE file for full copyright and licensing details.

from contextlib import contextmanager
from unittest.mock import Mock, patch

from odoo.tests import tagged
from odoo.tests.common import TransactionCase

REQUESTS_POST = 'odoo.addons.pos_dpopay.models.pos_payment_method.requests.post'


@tagged('post_install', '-at_install')
class TestDpoPayPaymentAttempt(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.payment_method = cls.env['pos.payment.method'].create({
            'name': 'DPO Pay',
            'type': 'bank',
            'payment_provider': 'dpopay',
            'dpopay_mid': '123456789012',
            'dpopay_tid': 'TESTTID',
            'dpopay_chain_id': 'CHAIN',
        })

    @contextmanager
    def _terminal(self, responses):
        self.sent = []

        def post(url, json=None, **kwargs):
            endpoint = url.rsplit('/', 1)[-1]
            self.sent.append(dict(json))
            response = Mock(status_code=200)
            response.json.return_value = responses[endpoint]
            return response

        with patch(REQUESTS_POST, post):
            yield

    def _send(self, endpoint, **data):
        self.payment_method.send_dpopay_request({'sourceId': 'SRC1', **data}, endpoint)
        return self.env['pos.payment.attempt'].search([('transaction_id', '=', 'SRC1')])

    def test_successful_payment(self):
        responses = {
            'start-transaction': {'success': True},
            'get-status': {'success': True, 'complete': False},
            'get-result': {'success': True, 'complete': True, 'resultCodeDescription': '00 - Approved'},
        }
        with self._terminal(responses):
            line = self._send('start-transaction', amount='1050', orderUuid='no-such-order')
            self.assertEqual((line.state, line.amount), ('processing', 10.5))
            self.assertNotIn('orderUuid', self.sent[0], "Odoo-only keys must not reach DPO Pay")
            self._send('get-status')
            responses['get-status'] = {'success': True, 'complete': True}
            self._send('get-status')
            self.assertEqual(line.state, 'processing')
            self._send('get-result')
        self.assertEqual((line.state, line.message), ('success', '00 - Approved'))

    def test_declined_payment(self):
        with self._terminal({
            'start-transaction': {'success': True},
            'get-status': {'success': False, 'complete': True, 'declined': True, 'resultCodeDescription': '05 - Do not honour'},
        }):
            self._send('start-transaction', amount='100')
            line = self._send('get-status')
        self.assertEqual((line.state, line.message), ('failed', '05 - Do not honour'))

    def test_start_error(self):
        with patch.object(type(self.payment_method), '_execute_dpopay_api_request',
                          return_value={'errorMessage': 'Terminal not ready'}):
            line = self._send('start-transaction', amount='100')
        self.assertEqual((line.state, line.message), ('failed', 'Terminal not ready'))

    def test_cancel_and_timeout(self):
        for reason, expected in ((None, 'cancelled'), ('timeout', 'timeout')):
            with self._terminal({'start-transaction': {'success': True}, 'cancel-transaction': {'responseCode': '00'}}):
                self._send('start-transaction', amount='100')
                line = self._send('cancel-transaction', cancelReason=reason)
            self.assertEqual(line.state, expected)
            self.assertNotIn('cancelReason', self.sent[-1])
            line.unlink()

    def test_terminal_check_is_not_logged(self):
        with self._terminal({'get-status': {'displayText': 'NO TXN / SYSTEM IDLE'}}):
            self.payment_method.send_dpopay_request({}, 'get-status')
        self.assertFalse(self.env['pos.payment.attempt'].search([('payment_method_id', '=', self.payment_method.id)]))
