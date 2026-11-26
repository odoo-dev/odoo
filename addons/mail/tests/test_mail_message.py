# Part of Odoo. See LICENSE file for full copyright and licensing details.

# from odoo import exceptions
from odoo.addons.mail.tests import common
from odoo.tests import HttpCase, JsonRpcException, new_test_user, tagged, users


@tagged("-at_install", "post_install", "mail_message")
class TestMailMessage(common.MailCommon):

    @users("employee")
    def test_can_star_message_without_write_access(self):
        message = self.env["mail.message"].sudo().create({
            "author_id": self.partner_admin.id,
            "model": "res.partner",
            "res_id": self.partner_admin.id,
            "body": "Hey this is me!",
        })
        message = message.sudo(False)
        self.env.user.group_ids -= self.env.ref("base.group_partner_manager")
        self.assertFalse(message.has_access("write"))
        message.toggle_message_starred()
        self.assertIn(self.env.user.partner_id, message.starred_partner_ids)
        self.env["mail.message"].unstar_all()
        self.assertNotIn(self.env.user.partner_id, message.starred_partner_ids)

    def test_mail_message_read_inexisting(self):
        inexisting_message = self.env['mail.message'].with_user(self.user_employee).browse(-434264)
        self.assertFalse(inexisting_message.exists())
        self.assertTrue(inexisting_message.browse().has_access('read'), 'Should not crash (can read void)')
        # TDE to check: cache pollution / inexisting not correctly tracked, ok-ish for stable
        # with self.assertRaises(exceptions.AccessError):
        #     inexisting_message.check_access_rule('read')

    def test_mail_message_read_access(self):
        self.env['res.company'].invalidate_model(['name'])
        message_c1 = self._add_messages(self.env.company, "Company Note 1", author=self.user_employee.partner_id)
        message_c2 = self._add_messages(self.company_2, "Company Note 2", author=self.user_employee_c2.partner_id)
        search_result = self.env["mail.message"].with_context(
            allowed_company_ids=[self.env.company.id]
        ).with_user(self.user_employee).search([("model", "=", "res.company")])
        self.assertIn(message_c1, search_result)
        self.assertNotIn(message_c2, search_result)

    def test_unlink_failure_message_notify_author(self):
        recipient = new_test_user(self.env, login="Bob", email="invalid_email_addr")
        with self.mock_mail_gateway():
            message = self.env.user.partner_id.message_post(
                body="Hello world!", partner_ids=recipient.partner_id.ids
            )
        self.assertEqual(message.notification_ids.failure_type, "mail_email_invalid")
        self.assertEqual(message.notification_ids.res_partner_id, recipient.partner_id)
        self.assertEqual(message.notification_ids.author_id, self.env.user.partner_id)
        with self.assertBus(
            [
                (self.cr.dbname, "res.partner", recipient.partner_id.id),
                (self.cr.dbname, "res.partner", self.env.user.partner_id.id),
            ],
            [
                {"type": "mail.message/delete", "payload": {"message_ids": [message.id]}},
                {"type": "mail.message/delete", "payload": {"message_ids": [message.id]}},
            ],
        ):
            message.unlink()
@tagged("post_install", "-at_install")
class TestAttachmentDeleteAccess(HttpCase):
    def test_mail_attachment_delete_readonly_user(self):
        partner = self.env["res.partner"].create({"name": "Test Partner"})
        attachment = self.env["ir.attachment"].create({
            "name": "readonly_test.txt",
            "res_model": "res.partner",
            "res_id": partner.id,
        })
        self.env["ir.model.access"].search([
            ("model_id.model", "=", "res.partner"),
        ]).write({"perm_write": False, "perm_create": False, "perm_unlink": False})

        self.authenticate('demo', 'demo')
        with self.assertRaises(JsonRpcException) as cm:
            self.make_jsonrpc_request(
                "/mail/attachment/delete",
                {"attachment_id": attachment.id},
            )
        self.assertEqual(str(cm.exception), "odoo.exceptions.AccessError")
        self.assertTrue(attachment.exists())
