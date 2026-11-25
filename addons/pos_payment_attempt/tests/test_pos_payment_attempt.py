# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import timedelta
from uuid import uuid4

from odoo import fields
from odoo.exceptions import AccessError, UserError
from odoo.tests import new_test_user, tagged

from odoo.addons.point_of_sale.tests.common import TestPoSCommon


@tagged('post_install', '-at_install')
class TestPosPaymentAttempt(TestPoSCommon):

    def setUp(self):
        super().setUp()
        self.config = self.basic_config
        self.product = self.create_product('Product Attempt', self.categ_basic, 10.0, 5.0)
        self.open_new_session()
        self.Attempt = self.env['pos.payment.attempt']

    def _log(self, attempt_uuid, state, **values):
        return self.Attempt.log_attempts_from_ui([{
            'uuid': attempt_uuid,
            'state': state,
            'payment_method_id': self.bank_pm1.id,
            'session_id': self.pos_session.id,
            **values,
        }])

    def _attempt(self, attempt_uuid):
        return self.Attempt.search([('uuid', '=', attempt_uuid)])

    def test_upsert_is_idempotent_and_forward_only(self):
        attempt_uuid = str(uuid4())
        self._log(attempt_uuid, 'initiated', amount=10.0, order_uuid='order-1', payment_uuid='pay-1')
        self._log(attempt_uuid, 'processing', transaction_id='TX-1')
        self._log(attempt_uuid, 'success', card_no='1234')
        # A replayed or late message must not reopen the attempt.
        self._log(attempt_uuid, 'processing')
        self._log(attempt_uuid, 'failed')

        attempt = self._attempt(attempt_uuid)
        self.assertEqual(len(attempt), 1)
        self.assertEqual(attempt.state, 'success')
        self.assertEqual(attempt.name, 'TX-1')
        self.assertEqual(attempt.card_no, '1234')
        self.assertEqual(attempt.amount, 10.0)
        self.assertEqual(attempt.session_id, self.pos_session)
        self.assertTrue(attempt.date_end)
        self.assertEqual(attempt.event_ids.mapped('state'), ['initiated', 'processing', 'success', 'processing', 'failed'])
        self.assertEqual(attempt.event_ids.mapped('state_applied'), [True, True, True, False, False])

    def test_transitions(self):
        allowed = self.Attempt._is_allowed_transition
        self.assertTrue(allowed('processing', 'initiated', 'server'))
        self.assertFalse(allowed('processing', 'initiated', 'pos'))
        self.assertTrue(allowed('unknown', 'success', 'pos'))
        self.assertTrue(allowed('failed', 'force_done', 'pos'))
        self.assertFalse(allowed('success', 'force_cancelled', 'pos'))
        self.assertFalse(allowed('cancelled', 'success', 'pos'))
        self.assertTrue(allowed('cancelled', 'success', 'server'))

    def test_failed_attempts_do_not_touch_payments(self):
        """Only the successful attempt becomes a payment; session totals ignore the others."""
        order_uuid = str(uuid4())
        payment_uuid = str(uuid4())
        failed_uuid, success_uuid = str(uuid4()), str(uuid4())
        common = {'order_uuid': order_uuid, 'payment_uuid': payment_uuid, 'amount': 10.0}
        self._log(failed_uuid, 'initiated', **common)
        self._log(failed_uuid, 'failed', error_message='Declined', **common)
        self._log(success_uuid, 'initiated', **common)
        self._log(success_uuid, 'success', transaction_id='TX-OK', **common)

        order_data = self.create_ui_order_data([(self.product, 1)], payments=[(self.bank_pm1, 10.0)], uuid=order_uuid)
        order_data['payment_ids'][0][2]['uuid'] = payment_uuid
        self.env['pos.order'].sync_from_ui([order_data])
        order = self.env['pos.order'].search([('uuid', '=', order_uuid)])

        self.assertEqual(len(order.payment_ids), 1)
        self.assertEqual(order.amount_paid, 10.0)
        self.assertEqual(set(order.payment_attempt_ids.mapped('state')), {'success', 'failed'})
        self.assertEqual(order.payment_attempt_count, 2)
        self.assertEqual(self._attempt(success_uuid).pos_payment_id, order.payment_ids)
        self.assertFalse(self._attempt(failed_uuid).pos_payment_id)
        self.assertEqual(self.pos_session.payment_attempt_count, 2)
        self.assertFalse(self.Attempt.get_attempts_to_recover(order_uuid))

    def test_attempts_to_recover(self):
        order_uuid = str(uuid4())
        open_uuid, paid_uuid, failed_uuid = str(uuid4()), str(uuid4()), str(uuid4())
        self._log(open_uuid, 'processing', order_uuid=order_uuid, transaction_id='TX-OPEN')
        self._log(paid_uuid, 'success', order_uuid=order_uuid, transaction_id='TX-PAID')
        self._log(failed_uuid, 'failed', order_uuid=order_uuid)

        to_recover = {a['uuid'] for a in self.Attempt.get_attempts_to_recover(order_uuid)}
        self.assertEqual(to_recover, {open_uuid, paid_uuid})
        self.assertEqual(self.pos_session.open_payment_attempt_count, 1)

        result = self._attempt(open_uuid).mark_reviewed_from_ui()
        self.assertEqual(result[0]['state'], 'unknown')
        to_recover = {a['uuid'] for a in self.Attempt.get_attempts_to_recover(order_uuid)}
        self.assertEqual(to_recover, {paid_uuid})

    def test_cron_marks_stale_attempts_unknown(self):
        attempt_uuid = str(uuid4())
        self._log(attempt_uuid, 'processing', transaction_id='TX-STALE')
        attempt = self._attempt(attempt_uuid)
        attempt.date_last_update = fields.Datetime.now() - timedelta(hours=1)
        fresh_uuid = str(uuid4())
        self._log(fresh_uuid, 'processing', transaction_id='TX-FRESH')

        self.Attempt._cron_check_stale_attempts()
        self.assertEqual(attempt.state, 'unknown')
        self.assertEqual(attempt.event_ids[-1].source, 'cron')
        self.assertEqual(self._attempt(fresh_uuid).state, 'processing')

    def test_open_attempts_cannot_be_deleted(self):
        attempt_uuid = str(uuid4())
        self._log(attempt_uuid, 'processing')
        with self.assertRaises(UserError):
            self._attempt(attempt_uuid).unlink()
        self._log(attempt_uuid, 'cancelled')
        self._attempt(attempt_uuid).unlink()

    def test_pos_user_access(self):
        pos_user = new_test_user(self.env, login='pos_attempt_user', groups='point_of_sale.group_pos_user')
        Attempt = self.Attempt.with_user(pos_user)
        attempt_uuid = str(uuid4())
        Attempt.log_attempts_from_ui([{
            'uuid': attempt_uuid, 'state': 'failed', 'payment_method_id': self.bank_pm1.id,
        }])
        attempt = Attempt.search([('uuid', '=', attempt_uuid)])
        self.assertEqual(attempt.state, 'failed')
        self.assertEqual(len(attempt.event_ids), 1)
        with self.assertRaises(AccessError):
            attempt.unlink()

    def test_ignores_invalid_payloads(self):
        self.assertEqual(self.Attempt.log_attempts_from_ui([
            {'state': 'initiated', 'payment_method_id': self.bank_pm1.id},
            {'uuid': str(uuid4()), 'state': 'initiated', 'payment_method_id': 0},
        ]), [])
