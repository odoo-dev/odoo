from odoo import fields, models
from datetime import timedelta
from odoo.tools.sql import SQL


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

        # Get journal names for formatting
        journal_names = {j.id: j.name for j in es_journals}

        # Optimized query for pending moves
        subquery_str, subquery_params = self.env['account.move']._get_l10n_es_sii_state_query_parts('to_send')
        pending_query = SQL(f"""
            SELECT am.journal_id, COUNT(*) as count, MAX(am.create_date) as max_date
            FROM account_move am
            WHERE am.id IN ({subquery_str})
            AND am.journal_id IN %s
            AND am.state = 'posted'
            GROUP BY am.journal_id
        """, subquery_params + (tuple(es_journals.ids),))
        self.env.cr.execute(pending_query)
        pending_results = self.env.cr.fetchall()

        # Format pending_groups like read_group output
        pending_groups = [
            {
                'journal_id': (row[0], journal_names.get(row[0], '')),
                'journal_id_count': row[1],
                'create_date': row[2],
            }
            for row in pending_results
        ]

        # Optimized query for errored journals
        errored_query = SQL(f"""
            SELECT DISTINCT am.journal_id
            FROM account_move am
            JOIN l10n_es_edi_sii_document d ON d.move_id = am.id
            WHERE am.id IN ({subquery_str})
            AND am.journal_id IN %s
            AND am.state = 'posted'
            AND d.response_message IS NOT NULL
        """, subquery_params + (tuple(es_journals.ids),))
        self.env.cr.execute(errored_query)
        errored_journal_ids = {row[0] for row in self.env.cr.fetchall()}

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
