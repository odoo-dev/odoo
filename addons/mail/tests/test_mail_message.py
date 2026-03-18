# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import Command
from odoo.addons.bus.tests.common import BusResult
from odoo.addons.mail.tests import common
from odoo.fields import Domain
from odoo.tests import HttpCase, new_test_user, tagged, users
from odoo.tests.common import RecordCapturer


@tagged("mail_message")
class TestMailMessage(common.MailCommon, HttpCase):

    @users("employee")
    def test_can_star_message_without_write_access(self):
        self.authenticate(self.env.user.login, self.env.user.login)
        message = self.env["mail.message"].sudo().create({
            "author_id": self.partner_admin.id,
            "model": "res.partner",
            "res_id": self.partner_admin.id,
            "body": "Hey this is me!",
        })
        message = message.sudo(False)
        self.env.user.group_ids -= self.env.ref("base.group_partner_manager")
        self.assertFalse(message.has_access("write"))
        self.make_jsonrpc_request(
            "/mail/action", {"fetch_params": [["add_bookmark", {"message_id": message.id}]]},
        )
        self.assertIn(self.env.user.partner_id, message.bookmarked_partner_ids)
        self.make_jsonrpc_request("/mail/action", {"fetch_params": ["remove_all_bookmarks"]})
        self.assertNotIn(self.env.user.partner_id, message.bookmarked_partner_ids)

    def test_mail_message_read_inexisting(self):
        user = new_test_user(self.env, login="Bob", email="bob@test.com")
        inexisting_message = self.env['mail.message'].with_user(user).browse(-434264)
        self.assertFalse(inexisting_message.exists())
        self.assertTrue(inexisting_message.browse().has_access('read'))
        self.assertFalse(inexisting_message.has_access('read'))

    def test_mail_message_read_access(self):
        self.env['res.company'].invalidate_model(['name'])
        message_c1 = self._add_messages(self.env.company, "Company Note 1", author=self.user_employee.partner_id)
        message_c2 = self._add_messages(self.company_2, "Company Note 2", author=self.user_employee_c2.partner_id)
        search_result = (
            self.env["mail.message"]
            .with_context(allowed_company_ids=[self.env.company.id])
            .with_user(self.user_employee)
            .search([("model", "=", "res.company")])
        )
        self.assertIn(message_c1, search_result)
        self.assertNotIn(message_c2, search_result)

    @users("employee")
    def test_unlink_failure_message_notify_author(self):
        recipient = new_test_user(self.env(su=True), login="Bob", email="invalid_email_addr")
        with self.mock_mail_gateway():
            message = self.env.user.partner_id.message_post(
                body="Hello world!", partner_ids=recipient.partner_id.ids
            )
        self.assertEqual(message.notification_ids.failure_type, "mail_email_invalid")
        self.assertEqual(message.notification_ids.res_partner_id, recipient.partner_id)
        self.assertEqual(message.notification_ids.author_id, self.env.user.partner_id)
        with self.assertBus(
            [
                BusResult(recipient, "mail.message/delete", {"message_ids": [message.id]}),
                BusResult(self.env.user, "mail.message/delete", {"message_ids": [message.id]}),
            ],
        ):
            message.unlink()

    def test_mail_message_partner_ids(self):
        """ Test search, compute, inverse for the partner_ids field. """
        Message = self.env['mail.message']
        all_partners = self.partner_root | self.partner_admin | self.partner_employee
        empty_partners = self.env['res.partner']
        with (RecordCapturer(Message) as capture):
            for create_values, (expected_partner_ids, expected_partner_to_ids, expected_partners_cc_ids) in (
                    ({'partner_to_ids': self.partner_root, 'partner_cc_ids': self.partner_employee},
                     (self.partner_root | self.partner_employee, self.partner_root, self.partner_employee)),
                    ({'partner_to_ids': [Command.link(self.partner_root.id), Command.link(self.partner_admin.id)],
                      'partner_cc_ids': [Command.link(self.partner_employee.id)]},
                     (all_partners, self.partner_root | self.partner_admin, self.partner_employee)),
                    ({'partner_ids': False, 'partner_cc_ids': False},
                     (empty_partners, empty_partners, empty_partners)),
                    ({'partner_ids': all_partners, 'partner_cc_ids': self.partner_employee},
                     (all_partners, self.partner_root | self.partner_admin, self.partner_employee)),
                    ({'partner_ids': all_partners, 'partner_cc_ids': False},
                     (all_partners, all_partners, empty_partners)),
                    ({'partner_ids': False, 'partner_cc_ids': self.partner_employee},
                     (empty_partners, empty_partners, empty_partners)),
            ):
                with self.subTest(create_values=create_values):
                    message = self.env['mail.message'].create(create_values)
                    self.assertEqual(message.partner_ids, expected_partner_ids)
                    self.assertEqual(message.partner_to_ids, expected_partner_to_ids)
                    self.assertEqual(message.partner_cc_ids, expected_partners_cc_ids)
        base_search = [('id', 'in', capture.records.ids)]
        self.assertEqual(len(Message.search([*base_search, ('partner_ids', 'in', self.partner_admin.ids)])), 3)
        self.assertEqual(len(Message.search([*base_search, ('partner_ids', 'not in', self.partner_admin.ids)])), 3)
        self.assertEqual(len(Message.search([*base_search, ('partner_ids', '=', self.partner_root.id)])), 4)
        self.assertEqual(len(Message.search([*base_search, ('partner_ids', '!=', self.partner_root.id)])), 2)
        self.assertEqual(len(Message.search(
            [*base_search, ('partner_ids', 'any', [('id', '=', self.partner_root.id)])])), 4)
        self.assertEqual(len(Message.search(
            [*base_search, ('partner_ids', 'not any', [('id', '=', self.partner_root.id)])])), 2)
        self.assertEqual(Message.search([*base_search, ('id', 'child_of', capture.records.ids[0])]),
                         capture.records[0])
        # See Domain.__new__ docstring
        self.assertEqual(len(Message.search(
            Domain.AND([base_search, Domain('partner_ids', 'any!', self.partner_root._as_query())]))),
            4)
        self.assertEqual(len(Message.search(
            Domain.AND([base_search, Domain('partner_ids', 'not any!', self.partner_root._as_query())]))),
            2)
        # Test a "create" message with the computed partner_ids field holding a create command
        message = Message.create({
            'partner_ids': [Command.set((self.partner_admin | self.partner_root).ids),
                            Command.create({'name': 'create_to', 'email': 'create_to@ex.com'})],
            'partner_cc_ids': [Command.set(self.partner_admin.ids)],
        })
        self.assertEqual(set(message.mapped('partner_to_ids.email')),
                         set(self.partner_root.mapped('email') + ['create_to@ex.com']))
        self.assertEqual(message.partner_cc_ids, self.partner_admin)
