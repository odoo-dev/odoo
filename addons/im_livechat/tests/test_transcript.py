# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tests.common import JsonRpcException, new_test_user
from odoo.tools import mute_logger
from odoo.addons.base.tests.common import HttpCaseWithUserPortal
from odoo.addons.im_livechat.tests.common import TestImLivechatCommon


class TestImLivechatTranscript(TestImLivechatCommon, HttpCaseWithUserPortal):
    def test_download_transcript(self):
        data = self.make_jsonrpc_request(
            "/im_livechat/get_session",
            {"channel_id": self.livechat_channel.id},
        )
        res = self.url_open(f"/im_livechat/download_transcript/{data['channel_id']}")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers["Content-Type"], "application/pdf")

    def test_download_transcript_non_member(self):
        test_user = new_test_user(self.env, login="test_user", password="test_user")
        self.authenticate(test_user.login, test_user.password)
        data = self.make_jsonrpc_request(
            "/im_livechat/get_session",
            {"channel_id": self.livechat_channel.id},
        )
        chat = self.env["discuss.channel"].browse(data["channel_id"])
        self.authenticate(None, None)
        self.assertFalse(chat.is_member)
        with mute_logger("odoo.http"):
            res = self.url_open(f"/im_livechat/download_transcript/{data['channel_id']}")
        self.assertEqual(res.status_code, 404)

    def test_email_transcript_portal_user(self):
        self.authenticate(self.user_portal.login, self.user_portal.login)
        data = self.make_jsonrpc_request(
            "/im_livechat/get_session",
            {"channel_id": self.livechat_channel.id},
        )
        with self.assertRaises(JsonRpcException, msg="werkzeug.exceptions.NotFound"):
            self.make_jsonrpc_request(
                "/im_livechat/email_livechat_transcript",
                {"channel_id": data["channel_id"], "email": self.partner_portal.email},
            )

    def test_transcript_internal_messages(self):
        """ Transcript is sent to the customer: internal messages are not included. """
        data = self.make_jsonrpc_request(
            "/im_livechat/get_session",
            {"channel_id": self.livechat_channel.id},
        )
        channel = self.env["discuss.channel"].browse(data["channel_id"])
        channel.message_post(body="Public answer", message_type="comment", subtype_xmlid="mail.mt_comment")
        channel._message_log(body="Internal step", message_type="comment")  # e.g. AI agent steps
        html = self.env["ir.actions.report"]._render_qweb_html(
            "im_livechat.action_report_livechat_conversation",
            channel.ids,
            data={"tz": channel._get_livechat_customer_timezone(), "correspondent_names": ""},
        )[0].decode()
        self.assertIn("Public answer", html)
        self.assertNotIn("Internal step", html)
