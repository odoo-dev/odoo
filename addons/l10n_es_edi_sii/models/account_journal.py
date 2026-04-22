from odoo import fields, models
from datetime import timedelta


class AccountJournal(models.Model):
    _inherit = 'account.journal'

    def _fill_sale_purchase_dashboard_data(self, dashboard_data):
        super()._fill_sale_purchase_dashboard_data(dashboard_data)

        es_journals = self.filtered(
            lambda j: j.type in ('sale', 'purchase') and j.company_id.account_fiscal_country_id.code == 'ES'
        )
        if not es_journals:
            return

        candidate_moves = self.env['account.move'].search([
            ('journal_id', 'in', es_journals.ids),
            ('state', '=', 'posted'),
            ('move_type', 'in', ('out_invoice', 'out_refund', 'in_invoice', 'in_refund')),
        ])

        moves_to_send = candidate_moves.filtered(lambda m: m.l10n_es_edi_is_required and m.l10n_es_edi_sii_state == 'to_send')
        limit_time = fields.Datetime.now() - timedelta(hours=36)

        for journal in es_journals:
            j_moves = moves_to_send.filtered(lambda m: m.journal_id == journal)
            count = len(j_moves)
            color = 'primary'

            if count > 0:
                if any(m.create_date and m.create_date < limit_time for m in j_moves):
                    color = 'danger'
                elif any(m.l10n_es_edi_sii_error for m in j_moves):
                    color = 'warning'

            dashboard_data[journal.id].update({
                'l10n_es_sii_to_send_count': count,
                'l10n_es_sii_state_color': color,
            })

    def action_open_l10n_es_sii_to_send(self):
        self.ensure_one()

        candidate_moves = self.env['account.move'].search([
            ('journal_id', '=', self.id),
            ('state', '=', 'posted'),
            ('move_type', 'in', ('out_invoice', 'out_refund', 'in_invoice', 'in_refund')),
        ])
        moves = candidate_moves.filtered(lambda m: m.l10n_es_edi_is_required and m.l10n_es_edi_sii_state == 'to_send')

        return {
            'name': self.env._('Invoices to Send to SII'),
            'type': 'ir.actions.act_window',
            'res_model': 'account.move',
            'view_mode': 'list,form',
            'domain': [('id', 'in', moves.ids)],
            'context': {
                'default_journal_id': self.id,
            }
        }
