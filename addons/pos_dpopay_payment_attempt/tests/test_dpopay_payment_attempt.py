# Part of Odoo. See LICENSE file for full copyright and licensing details.

from contextlib import contextmanager
from unittest.mock import Mock, patch
from uuid import uuid4

from odoo.tests import tagged
from odoo.tests.common import TransactionCase

REQUESTS_POST = 'odoo.addons.pos_dpopay.models.pos_payment_method.requests.post'

APPROVED_RESULT = {
    'success': True, 'complete': True, 'declined': False, 'resultCode': '00',
    'resultCodeDescription': '00 - Approved', 'sourceid': 'SRC1', 'authCode': '333777',
    'panMasked': '4069 04** **** 2831', 'cardType': 'VISA', 'rrn': '000000000040',
}


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
        cls.Attempt = cls.env['pos.payment.attempt']

    @contextmanager
    def _terminal(self, responses):
        """Answer the DPO Pay endpoints with ``responses[endpoint]`` and record the payloads."""
        self.sent = []

        def post(url, json=None, **kwargs):
            endpoint = url.rsplit('/', 1)[-1]
            self.sent.append((endpoint, dict(json)))
            response = Mock(status_code=200)
            response.json.return_value = responses[endpoint]
            return response

        with patch(REQUESTS_POST, post):
            yield

    def _send(self, endpoint, **data):
        return self.payment_method.send_dpopay_request({'sourceId': 'SRC1', **data}, endpoint)

    def test_successful_payment(self):
        attempt_uuid = str(uuid4())
        responses = {
            'start-transaction': {'success': True, 'complete': False},
            'get-status': {'success': True, 'complete': False, 'inProgress': True},
            'get-result': APPROVED_RESULT,
        }
        with self._terminal(responses):
            self._send('start-transaction', amount='1050', currency='404', attemptUuid=attempt_uuid)
            attempt = self.Attempt.search([('uuid', '=', attempt_uuid)])
            self.assertEqual(attempt.state, 'processing')
            self.assertEqual(attempt.amount, 10.5)
            self.assertNotIn('attemptUuid', self.sent[0][1], "Odoo-only keys must not reach DPO Pay")

            # Polling without news doesn't flood the timeline.
            self._send('get-status', attemptUuid=attempt_uuid)
            self._send('get-status', attemptUuid=attempt_uuid)
            self.assertEqual(len(attempt.event_ids), 1)

            responses['get-status'] = {'success': True, 'complete': True, 'resultCode': '00'}
            self._send('get-status', attemptUuid=attempt_uuid)
            self._send('get-result', attemptUuid=attempt_uuid)

        self.assertEqual(attempt.state, 'success')
        self.assertEqual(attempt.name, 'SRC1')
        self.assertEqual(attempt.card_no, '2831')
        self.assertEqual(attempt.card_brand, 'VISA')
        self.assertEqual(attempt.authcode, '333777')
        self.assertEqual(attempt.event_ids[-1].source, 'server')

    def test_declined_payment(self):
        with self._terminal({
            'start-transaction': {'success': True},
            'get-status': {'success': False, 'complete': True, 'declined': True, 'resultCodeDescription': '05 - Do not honour'},
        }):
            self._send('start-transaction', amount='100')
            self._send('get-status')
        attempt = self.Attempt.search([('name', '=', 'SRC1')])
        self.assertEqual(attempt.state, 'failed')
        self.assertEqual(attempt.error_message, '05 - Do not honour')

    def test_cancel_and_timeout(self):
        for reason, expected in ((None, 'cancelled'), ('timeout', 'timeout')):
            attempt_uuid = str(uuid4())
            with self._terminal({'start-transaction': {'success': True}, 'cancel-transaction': {'responseCode': '00'}}):
                self._send('start-transaction', amount='100', attemptUuid=attempt_uuid)
                self._send('cancel-transaction', attemptUuid=attempt_uuid, cancelReason=reason)
            self.assertEqual(self.Attempt.search([('uuid', '=', attempt_uuid)]).state, expected)
            self.Attempt.search([('name', '=', 'SRC1')]).unlink()

    def test_terminal_check_without_source_id_is_not_logged(self):
        with self._terminal({'get-status': {'displayText': 'NO TXN / SYSTEM IDLE'}}):
            self.payment_method.send_dpopay_request({}, 'get-status')
        self.assertFalse(self.Attempt.search([('payment_method_id', '=', self.payment_method.id)]))

    def test_check_status_recovers_paid_attempt(self):
        """The browser died after the customer paid: the server check finds the payment."""
        attempt = self.Attempt._upsert(str(uuid4()), self.payment_method, state='unknown', values={'name': 'SRC1'})
        with self._terminal({
            'get-status': {'success': True, 'complete': True, 'resultCode': '00'},
            'get-result': APPROVED_RESULT,
        }):
            attempt.action_check_status()
        self.assertEqual(attempt.state, 'success')
        self.assertEqual(attempt.card_no, '2831')

    def test_check_status_unknown_transaction(self):
        attempt = self.Attempt._upsert(str(uuid4()), self.payment_method, state='processing', values={'name': 'SRC1'})
        with patch.object(type(self.payment_method), '_execute_dpopay_api_request',
                          return_value={'errorMessage': 'Transaction not found'}):
            attempt.action_check_status()
        self.assertEqual(attempt.state, 'failed')
