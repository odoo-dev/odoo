# Part of Odoo. See LICENSE file for full copyright and licensing details.

from itertools import product

from markupsafe import Markup

from odoo.addons.mail.tests.common_controllers import MailControllerLinkPreviewCommon
from odoo.tests import tagged


@tagged("mail_controller")
class TestPortalLinkPreviewController(MailControllerLinkPreviewCommon):

    def test_link_preview_portal(self):
        """Test link preview and hide access on a portal record."""
        rec_partner = self.env["res.partner"].create({"name": "Record Partner"})
        record = self.env["mail.test.portal"].create({"name": "Test", "partner_id": rec_partner.id})
        token, bad_token, sign, bad_sign, sign_partner = self._get_sign_token_params(record)
        # token path: valid token grants access regardless of authorship
        rec_partner_msg = record.message_post(
            body=Markup('<a href="https://example.com">link</a>'), author_id=rec_partner.id
        )
        users = (self.guest, self.user_employee, self.user_portal, self.user_public)
        self._execute_subtests(rec_partner_msg, product(users, (token,)), allowed=True)
        self._execute_subtests(
            rec_partner_msg,
            product(users, ({}, bad_token, bad_sign, sign)),
            allowed=False,
        )
        # sign path: valid sign for assigned partner grants access
        sign_partner_msg = record.message_post(
            body=Markup('<a href="https://example.com">link</a>'), author_id=sign_partner.id
        )
        self._execute_subtests(sign_partner_msg, product(users, (sign,)), allowed=True)
        self._execute_subtests(
            sign_partner_msg,
            product(users, ({}, bad_token, bad_sign, token)),
            allowed=False,
        )
