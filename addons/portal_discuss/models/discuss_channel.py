# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class DiscussChannel(models.Model):
    _inherit = "discuss.channel"

    def _generate_avatar(self):
        if self.channel_type == "chat" and self.env.user.share:
            # sudo: discuss.channel - only the correspondent's initials are shown to the portal
            # user, like livechat does for visitors, so their real uploaded photo is never exposed
            return super(DiscussChannel, self.sudo())._generate_avatar()
        return super()._generate_avatar()

    def _get_invite_urls_by_emails(self, emails):
        urls = super()._get_invite_urls_by_emails(emails)
        portal_emails = self.env["res.users"].search_fetch([
                ("partner_id.email_normalized", "in", list(emails)),
                ("share", "=", True),
                ("active", "=", True),
            ], ["email_normalized"]).mapped("email_normalized")
        for email in portal_emails:
            urls[email] = f"/my/conversations/{self.id}"
        return urls
