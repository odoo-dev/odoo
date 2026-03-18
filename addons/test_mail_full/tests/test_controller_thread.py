from ast import literal_eval

from odoo.addons.http_routing.tests.common import MockRequest
from odoo.addons.mail.controllers.thread import ThreadController
from odoo.addons.mail.tests.common_controllers import MailControllerThreadCommon, MessagePostSubTestData
from odoo.tests import RecordCapturer, tagged


@tagged("-at_install", "post_install", "mail_controller")
class TestPortalThreadController(MailControllerThreadCommon):

    def test_message_post_portal_no_partner(self):
        """Test access of message post for portal without partner."""
        record = self.env["mail.test.portal.no.partner"].create({"name": "Test"})
        token, bad_token, sign, bad_sign, partner = self._get_sign_token_params(record)

        def test_access(user, allowed, route_kw=None, exp_author=None):
            return MessagePostSubTestData(user, allowed, route_kw=route_kw, exp_author=exp_author)

        self._execute_message_post_subtests(
            record,
            (
                test_access(self.user_public, False),
                test_access(self.user_public, False, route_kw=bad_token),
                test_access(self.user_public, False, route_kw=bad_sign),
                test_access(self.user_public, True, route_kw=token),
                test_access(self.user_public, True, route_kw=sign, exp_author=partner),
                test_access(self.guest, False),
                test_access(self.guest, False, route_kw=bad_token),
                test_access(self.guest, False, route_kw=bad_sign),
                test_access(self.guest, True, route_kw=token),
                test_access(self.guest, True, route_kw=sign, exp_author=partner),
                test_access(self.user_portal, False),
                test_access(self.user_portal, False, route_kw=bad_token),
                test_access(self.user_portal, False, route_kw=bad_sign),
                test_access(self.user_portal, True, route_kw=token),
                test_access(self.user_portal, True, route_kw=sign),
                test_access(self.user_employee, True),
                test_access(self.user_employee, True, route_kw=bad_token),
                test_access(self.user_employee, True, route_kw=bad_sign),
                test_access(self.user_employee, True, route_kw=token),
                test_access(self.user_employee, True, route_kw=sign),
            ),
        )

    def test_message_post_portal_with_partner(self):
        """Test access of message post for portal with partner."""
        rec_partner = self.env["res.partner"].create({"name": "Record Partner"})
        record = self.env["mail.test.portal"].create({"name": "Test", "partner_id": rec_partner.id})
        token, bad_token, sign, bad_sign, partner = self._get_sign_token_params(record)

        def test_access(user, allowed, route_kw=None, exp_author=None):
            return MessagePostSubTestData(user, allowed, route_kw=route_kw, exp_author=exp_author)

        self._execute_message_post_subtests(
            record,
            (
                test_access(self.user_public, False),
                test_access(self.user_public, False, route_kw=bad_token),
                test_access(self.user_public, False, route_kw=bad_sign),
                test_access(self.user_public, True, route_kw=token, exp_author=rec_partner),
                test_access(self.user_public, True, route_kw=sign, exp_author=partner),
                # sign has priority over token when both are provided
                test_access(self.user_public, True, route_kw=token | sign, exp_author=partner),
                test_access(self.guest, False),
                test_access(self.guest, False, route_kw=bad_token),
                test_access(self.guest, False, route_kw=bad_sign),
                test_access(self.guest, True, route_kw=token, exp_author=rec_partner),
                test_access(self.guest, True, route_kw=sign, exp_author=partner),
                test_access(self.guest, True, route_kw=token | sign, exp_author=partner),
                test_access(self.user_portal, False),
                test_access(self.user_portal, False, route_kw=bad_token),
                test_access(self.user_portal, False, route_kw=bad_sign),
                test_access(self.user_portal, True, route_kw=token),
                test_access(self.user_portal, True, route_kw=sign),
                test_access(self.user_employee, True),
                test_access(self.user_employee, True, route_kw=bad_token),
                test_access(self.user_employee, True, route_kw=bad_sign),
                test_access(self.user_employee, True, route_kw=token),
                test_access(self.user_employee, True, route_kw=sign),
            ),
        )

    def test_message_post_partner_ids_mention_token(self):
        """Test partner_ids of message_post for portal record without partner.
        All users are allowed to mention with specific message_mention token."""
        record = self.env["mail.test.portal.no.partner"].create({"name": "Test"})
        token, bad_token, sign, bad_sign, partner = self._get_sign_token_params(record)
        all_partners = (
            self.user_portal + self.user_employee + self.user_admin
        ).partner_id
        record.message_subscribe(partner_ids=self.user_employee.partner_id.ids)

        def test_partners(user, allowed, exp_partners, route_kw=None, exp_author=None):
            return MessagePostSubTestData(
                user,
                allowed,
                partners=all_partners,
                route_kw=route_kw,
                exp_author=exp_author,
                exp_partners=exp_partners,
                add_mention_token=True,
            )

        self._execute_message_post_subtests(
            record,
            (
                test_partners(self.user_public, False, all_partners),
                test_partners(self.user_public, False, all_partners, route_kw=bad_token),
                test_partners(self.user_public, False, all_partners, route_kw=bad_sign),
                test_partners(self.user_public, True, all_partners, route_kw=token),
                test_partners(self.user_public, True, all_partners, route_kw=sign, exp_author=partner),
                test_partners(self.guest, False, all_partners),
                test_partners(self.guest, False, all_partners, route_kw=bad_token),
                test_partners(self.guest, False, all_partners, route_kw=bad_sign),
                test_partners(self.guest, True, all_partners, route_kw=token),
                test_partners(self.guest, True, all_partners, route_kw=sign, exp_author=partner),
                test_partners(self.user_portal, False, all_partners),
                test_partners(self.user_portal, False, all_partners, route_kw=bad_token),
                test_partners(self.user_portal, False, all_partners, route_kw=bad_sign),
                test_partners(self.user_portal, True, all_partners, route_kw=token),
                test_partners(self.user_portal, True, all_partners, route_kw=sign),
                test_partners(self.user_employee, True, all_partners),
                test_partners(self.user_employee, True, all_partners, route_kw=bad_token),
                test_partners(self.user_employee, True, all_partners, route_kw=bad_sign),
                test_partners(self.user_employee, True, all_partners, route_kw=token),
                test_partners(self.user_employee, True, all_partners, route_kw=sign),
            ),
        )

    def test_message_post_partner_ids_portal(self):
        """Test partner_ids of message_post for portal record without partner.
        Only internal users are allowed to mention without specific message_mention token."""
        record = self.env["mail.test.portal.no.partner"].create({"name": "Test"})
        token, bad_token, sign, bad_sign, partner = self._get_sign_token_params(record)
        all_partners = (
            self.user_portal + self.user_employee + self.user_admin
        ).partner_id
        record.message_subscribe(partner_ids=self.user_employee.partner_id.ids)

        def test_partners(user, allowed, exp_partners, route_kw=None, exp_author=None):
            return MessagePostSubTestData(
                user,
                allowed,
                partners=all_partners,
                route_kw=route_kw,
                exp_author=exp_author,
                exp_partners=exp_partners,
            )

        self._execute_message_post_subtests(
            record,
            (
                test_partners(self.user_public, False, self.env["res.partner"]),
                test_partners(self.user_public, False, self.env["res.partner"], route_kw=bad_token),
                test_partners(self.user_public, False, self.env["res.partner"], route_kw=bad_sign),
                test_partners(self.user_public, True, self.env["res.partner"], route_kw=token),
                test_partners(self.user_public, True, self.env["res.partner"], route_kw=sign, exp_author=partner),
                test_partners(self.guest, False, self.env["res.partner"]),
                test_partners(self.guest, False, self.env["res.partner"], route_kw=bad_token),
                test_partners(self.guest, False, self.env["res.partner"], route_kw=bad_sign),
                test_partners(self.guest, True, self.env["res.partner"], route_kw=token),
                test_partners(self.guest, True, self.env["res.partner"], route_kw=sign, exp_author=partner),
                test_partners(self.user_portal, False, self.env["res.partner"]),
                test_partners(self.user_portal, False, self.env["res.partner"], route_kw=bad_token),
                test_partners(self.user_portal, False, self.env["res.partner"], route_kw=bad_sign),
                test_partners(self.user_portal, True, self.env["res.partner"], route_kw=token),
                test_partners(self.user_portal, True, self.env["res.partner"], route_kw=sign),
                test_partners(self.user_employee, True, all_partners),
                test_partners(self.user_employee, True, all_partners, route_kw=bad_token),
                test_partners(self.user_employee, True, all_partners, route_kw=bad_sign),
                test_partners(self.user_employee, True, all_partners, route_kw=token),
                test_partners(self.user_employee, True, all_partners, route_kw=sign),
            ),
        )

    def test_mail_message_post(self):
        """Test sending a mail with the controller using "Cc"."""
        test_record = self.env['mail.test.ticket.mc'].create({'name': 'TestRecord'})
        partner_to1, partner_cc1, partner_to2, partner_cc2 = self.env['res.partner'].create([
            {'name': f'partner{name}', 'email': f'test_mail_message_post_{name}@ex.com'}
            for name in ('to1', 'cc1', 'to2', 'cc2')])
        partner_to = partner_to1 | partner_to2
        partner_cc = partner_cc1 | partner_cc2
        with (self.mock_mail_gateway(mail_unlink_sent=False),
              MockRequest(self.env(user=self.user_employee)),
              RecordCapturer(self.env['mail.mail'].sudo()) as capture_mail):
            res = ThreadController().mail_message_post(
                'mail.test.ticket.mc',
                test_record.id,
                {
                    "body": "Test message",
                    "partner_ids": partner_to.ids,
                    "partner_cc_ids": partner_cc.ids,
                },
            )
        message = self.env['mail.message'].browse(res['message_id'])
        self.assertEqual(message.partner_ids, partner_to | partner_cc)
        self.assertEqual(message.partner_to_ids, partner_to)
        self.assertEqual(message.partner_cc_ids, partner_cc)
        mail = capture_mail.records
        self.assertEqual(len(mail), 1)
        header = literal_eval(mail.headers)
        self.assertEqual(header.get('X-Msg-Cc-Force'), ','.join(partner_cc.mapped('email_formatted')))
