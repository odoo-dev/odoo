# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime, timedelta

from odoo.addons.event.tests.common import EventCase
from odoo.tests import HttpCase, tagged


@tagged('post_install', '-at_install')
class TestEventRegistrationTransferPortal(EventCase, HttpCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.event = cls.env['event.event'].create({
            'name': 'Portal Transfer Event',
            'date_begin': datetime.now() + timedelta(days=10),
            'date_end': datetime.now() + timedelta(days=11),
            'allow_transfer': True,
            'allow_transfer_return': True,
        })
        cls.registration = cls.env['event.registration'].create({
            'event_id': cls.event.id,
            'partner_id': cls.user_portal.partner_id.id,
            'state': 'open',
        })

    def test_portal_transfer_flow(self):
        self.authenticate(self.user_portal.login, self.user_portal.login)
        response = self.url_open('/my/events')
        self.assertIn(f'/my/events/{self.registration.id}/transfer', response.text)

        response = self.url_open(f'/my/events/{self.registration.id}/transfer', data={
            'csrf_token': self.csrf_token(),
            'recipient': 'nobody@test.example.com',
        })
        self.assertIn('No contact matches', response.text)
        self.assertFalse(self.registration.transfer_ids)

        response = self.url_open(f'/my/events/{self.registration.id}/transfer', data={
            'csrf_token': self.csrf_token(),
            'recipient': self.event_customer.email,
        })
        self.assertTrue(response.url.endswith('/my/events?transfer=sent'))
        transfer = self.registration.transfer_ids
        self.assertEqual(transfer.state, 'pending')
        self.assertEqual(transfer.recipient_partner_id, self.event_customer)

        # recipient opens the link without being logged in
        self.logout()
        response = self.url_open(f'/event/transfer/{transfer.id}')
        self.assertEqual(response.status_code, 404, "The access token is required")
        response = self.url_open(transfer.get_portal_url())
        self.assertIn('Accept Ticket', response.text)
        response = self.url_open(f'/event/transfer/{transfer.id}/accept', data={
            'csrf_token': self.csrf_token(),
            'access_token': transfer.access_token,
        })
        self.assertIn('The ticket is yours', response.text)
        self.assertEqual(self.registration.partner_id, self.event_customer)

        # the previous owner can no longer manage the ticket
        self.authenticate(self.user_portal.login, self.user_portal.login)
        response = self.url_open(f'/my/events/{self.registration.id}/transfer')
        self.assertEqual(response.status_code, 404)
