from odoo import _, fields, models


class AccountJournal(models.Model):
    _inherit = 'account.journal'

    l10n_dk_nemhandel_proxy_state = fields.Selection(related='company_id.l10n_dk_nemhandel_proxy_state')
    is_l10n_dk_nemhandel_journal = fields.Boolean(string="Account used for Nemhandel", default=False)

    def l10n_dk_nemhandel_get_new_documents(self):
        edi_users = self.env['account_edi_proxy_client.user'].search([
            ('company_id.l10n_dk_nemhandel_proxy_state', '=', 'active'),
            ('company_id', 'in', self.company_id.ids),
        ])
        edi_users._l10n_dk_nemhandel_get_new_documents()

    def l10n_dk_nemhandel_get_message_status(self):
        edi_users = self.env['account_edi_proxy_client.user'].search([
            ('company_id.l10n_dk_nemhandel_proxy_state', '=', 'active'),
            ('company_id', 'in', self.company_id.ids),
        ])
        edi_users._l10n_dk_nemhandel_get_message_status()

    def action_l10n_dk_nemhandel_ready_moves(self):
        return {
            'name': _("Nemhandel Ready invoices"),
            'type': 'ir.actions.act_window',
            'view_mode': 'list,form',
            'res_model': 'account.move',
            'context': {
                'search_default_l10n_dk_nemhandel_ready': 1,
            }
        }
