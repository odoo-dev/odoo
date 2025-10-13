from odoo import models


class AccountMoveSendWizard(models.TransientModel):
    _inherit = 'account.move.send.wizard'

    def _get_default_sending_settings(self, move, from_cron=False, **custom_settings):
        # Extends from account.move.send
        vals = super()._get_default_sending_settings(move, from_cron=False, **custom_settings)
        if 'peppol' in vals['sending_methods']:
            vals['extra_attachments_to_embed'] = [
                self.env['ir.attachment'].browse(attachment.get('id'))
                for attachment in self.mail_attachments_widget
                if attachment.get('manual') and isinstance(attachment.get('id'), int)
                and attachment.get('mimetype') in (
                       'application/pdf', 'text/csv',
                       'application/vnd.ms-excel', 'image/png',
                )
            ]
        return vals
