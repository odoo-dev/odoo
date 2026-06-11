# Part of Odoo. See LICENSE file for full copyright and licensing details.

from markupsafe import Markup

from odoo.addons.mail.tests.common_controllers import MailControllerLinkPreviewCommon
from odoo.tests import tagged


@tagged("mail_controller")
class TestMailLinkPreviewController(MailControllerLinkPreviewCommon):

    def test_link_preview(self):
        """Test link preview and hide access on a record."""
        record = self.env["mail.test.access.public"].create({"name": "Test"})
        message = record.with_user(self.user_employee).message_post(
            body=Markup('<a href="https://example.com">link</a>')
        )
        self._execute_subtests(message, (self.user_admin, self.user_employee), allowed=True)
        self._execute_subtests(
            message,
            (
                self.guest,
                self.user_portal,
                self.user_public,
            ),
            allowed=False,
        )
