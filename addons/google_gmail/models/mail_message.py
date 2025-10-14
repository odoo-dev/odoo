# Part of Odoo. See LICENSE file for full copyright and licensing details.

import re

from odoo import _, models
from odoo.exceptions import UserError
from odoo.tools import email_normalize


class MailMessage(models.Model):
    _inherit = "mail.message"

    def action_delete_from_gmail(self):
        """Delete permanently the email from Gmail."""
        self.ensure_one()
        if not self.env.is_admin():
            raise UserError(_("Only admin can delete messages from Gmail."))

        # `incoming_email_to` might be @gmail1.domain.com instead of @domain.com
        emails = (
            email_normalize(self.incoming_email_to),
            email_normalize(self.reply_to),
        )
        # remove the alias part if any (eg mail+test@gmail.com)
        emails = (*emails, *(re.sub(r"\+.+@", "@", e) for e in emails))

        server = self.env["fetchmail.server"].search(
            [
                ("user", "in", emails),
                ("server_type", "=", "gmail"),
            ],
            limit=1,
        )
        if not server:
            raise UserError(_("No Gmail mail server found."))

        connection = server._connect__()
        connection.select("INBOX")
        ok, result = connection.search(
            None,
            "HEADER",
            "Message-ID",
            self.message_id,
        )

        if ok != "OK" or not result[0]:
            raise UserError(_("Failed to delete the email."))

        for identifier in result[0].split():
            connection.store(identifier, "+FLAGS", "\\Deleted")
        connection.expunge()
        connection.logout()
