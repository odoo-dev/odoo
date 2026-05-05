from odoo import fields, models
from datetime import timedelta


class AccountJournal(models.Model):
    _inherit = 'account.journal'

    def _fill_sale_purchase_dashboard_data(self, dashboard_data):
        super()._fill_sale_purchase_dashboard_data(dashboard_data)

        # Only journals whose company has SII configured (approximates l10n_es_edi_is_required)
        es_journals = self.filtered(
            lambda j: j.type in ('sale', 'purchase') and j.company_id.l10n_es_sii_tax_agency
        )
        if not es_journals:
            return

        limit_time = fields.Datetime.now() - timedelta(hours=36)
        pending_domain = [
            ('journal_id', 'in', es_journals.ids),
            ('state', '=', 'posted'),
            ('l10n_es_edi_sii_state', '=', 'to_send'),
        ]

        # Count pending moves per journal; also retrieve the oldest create_date for aging detection.
        pending_groups = self.env['account.move'].read_group(
            domain=pending_domain,
            fields=['journal_id', 'create_date:min'],
            groupby=['journal_id'],
        )

        # Which of those journals also have at least one move with an error response.
        errored_journal_ids = {
            g['journal_id'][0]
            for g in self.env['account.move'].read_group(
                domain=pending_domain + [('l10n_es_edi_sii_document_ids.response_message', '!=', False)],
                fields=['journal_id'],
                groupby=['journal_id'],
            )
        }

        for group in pending_groups:
            journal_id = group['journal_id'][0]
            count = group['journal_id_count']
            min_date = group['create_date']
            color = 'primary'
            if min_date and min_date < limit_time:
                color = 'danger'
            elif journal_id in errored_journal_ids:
                color = 'warning'
            dashboard_data[journal_id].update({
                'l10n_es_sii_to_send_count': count,
                'l10n_es_sii_state_color': color,
            })

    def action_open_l10n_es_sii_to_send(self):
        self.ensure_one()
        return {
            'name': self.env._('Invoices to Send to SII'),
            'type': 'ir.actions.act_window',
            'res_model': 'account.move',
            'view_mode': 'list,form',
            'domain': [
                ('journal_id', '=', self.id),
                ('state', '=', 'posted'),
                ('l10n_es_edi_sii_state', '=', 'to_send'),
            ],
            'context': {'default_journal_id': self.id},
        }
