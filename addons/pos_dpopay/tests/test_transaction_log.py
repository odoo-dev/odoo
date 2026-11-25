# Part of Odoo. See LICENSE file for full copyright and licensing details.

from contextlib import contextmanager
from unittest.mock import Mock, call, patch

from odoo.tests import tagged
from odoo.tests.common import TransactionCase

REQUESTS_POST = 'odoo.addons.pos_dpopay.models.pos_payment_method.requests.post'


@tagged('post_install', '-at_install')
class TestPosDpoPayTransactionLog(TransactionCase):

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
        """Answer each DPO Pay endpoint with ``responses[endpoint]``; record payloads and log calls."""
        self.sent = []

        def post(url, json=None, **kwargs):
            self.sent.append(dict(json))
            response = Mock(status_code=200)
            response.json.return_value = responses[url.rsplit('/', 1)[-1]]
            return response

        with patch(REQUESTS_POST, post), \
                patch.object(type(self.payment_method), '_log_terminal_transaction', autospec=True) as log:
            self.log = log
            yield

    def _send(self, endpoint, **data):
        self.payment_method.send_dpopay_request({'sourceId': 'SRC1', **data}, endpoint)

    def test_successful_payment(self):
        responses = {
            'start-transaction': {'success': True},
            'get-status': {'success': True, 'complete': False},
            'get-result': {'success': True, 'complete': True, 'resultCodeDescription': '00 - Approved'},
        }
        pm = self.payment_method
        with self._terminal(responses):
            self._send('start-transaction', amount='1050', orderUuid='ORDER-UUID')
            self._send('get-status')
            responses['get-status'] = {'success': True, 'complete': True}
            self._send('get-status')
            self._send('get-result')
        self.assertNotIn('orderUuid', self.sent[0], "Odoo-only keys must not reach DPO Pay")
        self.assertEqual(self.log.call_args_list, [
            call(pm, 'SRC1', 'processing', amount=10.5, message=None, order_uuid='ORDER-UUID'),
            call(pm, 'SRC1', 'processing'),
            call(pm, 'SRC1', 'success', message='00 - Approved'),
        ])

    def test_failures(self):
        pm = self.payment_method
        with self._terminal({
            'get-status': {'success': False, 'complete': True, 'declined': True, 'resultCodeDescription': '05 - Do not honour'},
            'cancel-transaction': {'responseCode': '00'},
        }):
            self._send('get-status')
            self._send('cancel-transaction')
            self._send('cancel-transaction', cancelReason='timeout')
        self.assertNotIn('cancelReason', self.sent[-1])
        self.assertEqual(self.log.call_args_list, [
            call(pm, 'SRC1', 'failed', message='05 - Do not honour'),
            call(pm, 'SRC1', 'cancelled'),
            call(pm, 'SRC1', 'timeout'),
        ])

    def test_start_error_and_readiness_check(self):
        with self._terminal({'get-status': {'displayText': 'NO TXN / SYSTEM IDLE'}}), \
                patch.object(type(self.payment_method), '_execute_dpopay_api_request',
                             side_effect=[{'displayText': 'NO TXN / SYSTEM IDLE'}, {'errorMessage': 'Terminal not ready'}]):
            self.payment_method.send_dpopay_request({}, 'get-status')
            self._send('start-transaction', amount='100')
        self.log.assert_called_once_with(
            self.payment_method, 'SRC1', 'failed', amount=1.0, message='Terminal not ready', order_uuid=None)
