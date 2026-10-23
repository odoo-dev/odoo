# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import timedelta

from freezegun import freeze_time

from odoo.addons.event.tests.common import EventCase
from odoo.exceptions import UserError
from odoo.tests import tagged, users


@tagged('post_install', '-at_install')
class TestEventRegistrationTransfer(EventCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.event = cls.env['event.event'].create({
            'name': 'Transfer Event',
            'date_begin': cls.reference_now + timedelta(days=10),
            'date_end': cls.reference_now + timedelta(days=11),
            'allow_transfer': True,
            'allow_transfer_return': True,
            'transfer_deadline_hours': 24,
            'transfer_expiry_hours': 48,
            'transfer_limit': 1,
        })
        cls.question = cls.env['event.question'].create({
            'title': 'Diet',
            'question_type': 'text_box',
            'event_ids': [(4, cls.event.id)],
        })
        cls.registration = cls.env['event.registration'].create({
            'event_id': cls.event.id,
            'partner_id': cls.event_customer.id,
            'state': 'open',
            'registration_answer_ids': [(0, 0, {'question_id': cls.question.id, 'value_text_box': 'Vegan'})],
        })
        cls.recipient = cls.event_customer2

    def _request(self, registration=None, recipient=None):
        return self.env['event.registration.transfer']._action_request(
            registration or self.registration, recipient or self.recipient)

    def test_event_type_policy(self):
        event_type = self.env['event.type'].create({
            'name': 'Transferable',
            'allow_transfer': True,
            'transfer_limit': 3,
        })
        event = self.env['event.event'].create({
            'name': 'From Template',
            'date_begin': self.reference_now + timedelta(days=1),
            'date_end': self.reference_now + timedelta(days=2),
            'event_type_id': event_type.id,
        })
        self.assertTrue(event.allow_transfer)
        self.assertEqual(event.transfer_limit, 3)
        self.assertEqual(event.transfer_deadline_hours, 24)

    def test_find_recipient(self):
        registration = self.registration
        self.assertEqual(registration._find_transfer_recipient('  CONSTANTIN2@test.example.com '), self.recipient)
        self.assertEqual(registration._find_transfer_recipient('+32 456 98 76 54'), self.recipient)
        self.assertEqual(registration._find_transfer_recipient('0456987654'), self.recipient)
        with self.assertRaises(UserError):
            registration._find_transfer_recipient('nobody@test.example.com')
        with self.assertRaises(UserError, msg="The current owner is not a valid recipient"):
            registration._find_transfer_recipient(self.event_customer.email)

    @freeze_time('2022-09-05 15:11:34')
    def test_transfer_flow(self):
        registration = self.registration
        old_barcode = registration.barcode
        self.assertTrue(registration.is_transfer_allowed)
        old_hash = self.event._get_tickets_access_hash(registration.ids)

        transfer = self._request()
        self.assertEqual(transfer.state, 'pending')
        self.assertEqual(transfer.sender_partner_id, self.event_customer)
        self.assertEqual(transfer.expiry_datetime, self.reference_now + timedelta(hours=48))
        self.assertTrue(transfer.access_token)
        self.assertEqual(registration.pending_transfer_id, transfer)
        self.assertFalse(registration.is_transfer_allowed, "A pending transfer blocks new ones")
        self.assertEqual(registration.partner_id, self.event_customer, "Ownership changes only on acceptance")
        self.assertIn(self.recipient, transfer.message_ids.partner_ids, "The acceptance link is sent to the recipient")

        transfer.action_accept()
        self.assertEqual(transfer.state, 'accepted')
        self.assertEqual(registration.partner_id, self.recipient)
        self.assertEqual(registration.email, self.recipient.email)
        self.assertEqual(registration.name, self.recipient.name)
        self.assertNotEqual(registration.barcode, old_barcode)
        self.assertEqual(transfer.previous_barcode, old_barcode)
        self.assertEqual(transfer.previous_email, self.event_customer.email)
        self.assertFalse(registration.registration_answer_ids, "Answers of the previous attendee are removed")
        self.assertEqual(
            self.env['event.registration'].register_attendee(old_barcode, self.event.id),
            {'error': 'invalid_ticket'})
        self.assertNotEqual(
            self.event._get_tickets_access_hash(registration.ids), old_hash,
            "Download links of the previous owner are voided")

        with self.assertRaises(UserError, msg="A transfer cannot be accepted twice"):
            transfer.action_accept()
        with self.assertRaises(UserError, msg="Transfer limit reached"):
            registration._check_transfer_allowed()

    @freeze_time('2022-09-05 15:11:34')
    def test_transfer_return(self):
        registration = self.registration
        transfer = self._request()
        transfer.action_accept()
        barcode = registration.barcode
        self.assertEqual(registration.returnable_transfer_id, transfer)

        transfer.action_return()
        self.assertEqual(transfer.state, 'returned')
        self.assertEqual(registration.partner_id, self.event_customer)
        self.assertEqual(registration.email, self.event_customer.email)
        self.assertNotEqual(registration.barcode, barcode)
        self.assertFalse(registration.returnable_transfer_id)
        with self.assertRaises(UserError, msg="Returned transfers count in the limit"):
            registration._check_transfer_allowed()

        self.event.allow_transfer_return = False
        self.event.transfer_limit = 0
        transfer = self._request()
        transfer.action_accept()
        self.assertFalse(registration.returnable_transfer_id)
        with self.assertRaises(UserError):
            transfer.action_return()

    @freeze_time('2022-09-05 15:11:34')
    def test_transfer_revoke_and_expire(self):
        registration = self.registration
        transfer = self._request()
        transfer.action_revoke()
        self.assertEqual(transfer.state, 'revoked')
        self.assertEqual(registration.partner_id, self.event_customer)
        with self.assertRaises(UserError):
            transfer.action_accept()

        transfer = self._request()
        with freeze_time(self.reference_now + timedelta(hours=49)):
            with self.assertRaises(UserError):
                transfer.action_accept()
            self.env['event.registration.transfer']._cron_expire_transfers()
        self.assertEqual(transfer.state, 'expired')
        self.assertEqual(registration.partner_id, self.event_customer)

    @freeze_time('2022-09-05 15:11:34')
    def test_transfer_policy(self):
        registration = self.registration
        with freeze_time(self.event.date_begin - timedelta(hours=23)):
            with self.assertRaises(UserError, msg="Transfer window closed"):
                self._request()

        # pending transfers never outlive the transfer window
        with freeze_time(self.event.date_begin - timedelta(hours=30)):
            transfer = self._request()
            self.assertEqual(transfer.expiry_datetime, self.event.date_begin - timedelta(hours=24))
            transfer.action_revoke()

        registration.action_cancel()
        with self.assertRaises(UserError, msg="Cancelled tickets cannot be transferred"):
            self._request()

        registration.action_confirm()
        self.event.allow_transfer = False
        with self.assertRaises(UserError, msg="Transfers disabled on the event"):
            self._request()

        self.event.allow_transfer = True
        transfer = self._request()
        registration.action_cancel()
        with self.assertRaises(UserError, msg="A cancelled ticket cannot be accepted"):
            transfer.action_accept()

    @users('user_eventregistrationdesk')
    @freeze_time('2022-09-05 15:11:34')
    def test_transfer_wizard(self):
        registration = self.registration.with_user(self.env.user)
        action = registration.action_open_transfer_wizard()
        wizard = self.env[action['res_model']].with_context(action['context']).create({
            'recipient_partner_id': self.recipient.id,
        })
        wizard.action_transfer_now()
        self.assertEqual(registration.partner_id, self.recipient)
        self.assertEqual(registration.transfer_ids.state, 'accepted')
