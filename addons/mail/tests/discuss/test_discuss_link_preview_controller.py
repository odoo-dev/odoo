# Part of Odoo. See LICENSE file for full copyright and licensing details.

from markupsafe import Markup

from odoo.addons.mail.tests.common_controllers import MailControllerLinkPreviewCommon
from odoo.tests import tagged


@tagged("mail_controller")
class TestDiscussLinkPreviewController(MailControllerLinkPreviewCommon):

    def test_link_preview_guest_as_author(self):
        """Test link preview and hide access on a channel."""
        channel = self.env["discuss.channel"].create(
            {"group_public_id": None, "name": "public channel"},
        )
        channel._add_members(guests=self.guest)
        # sudo: discuss.channel: posting a message as guest in a test is acceptable
        message = (
            channel.with_user(self.user_public)
            .with_context(guest=self.guest)
            .sudo()
            .message_post(body=Markup('<a href="https://example.com">link</a>'))
        )
        self._execute_subtests(message, (self.guest, self.user_admin), allowed=True)
        self._execute_subtests(
            message,
            (
                self.user_employee,
                self.user_portal,
                self.user_public,
            ),
            allowed=False,
        )
