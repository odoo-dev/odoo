from odoo import models


class AccountJournal(models.Model):
    _inherit = 'account.journal'

    # TODO: maybe not
    def peppol_get_message_status(self):
        """Override to fetch incoming lifecycle message"""
        super().peppol_get_message_status()
        edi_users = self.env['account_edi_proxy_client.user'].search([
            ('company_id.account_peppol_proxy_state', '=', 'receiver'),
            ('company_id', 'in', self.company_id.ids),
            ('proxy_type', 'in', self.env['account_edi_proxy_client.user']._get_peppol_proxy_types()),
        ])
        edi_users._peppol_get_message_status()
