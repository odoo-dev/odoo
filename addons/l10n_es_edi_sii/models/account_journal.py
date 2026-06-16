# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models
from odoo.tools import SQL


class AccountJournal(models.Model):
    _inherit = 'account.journal'

    l10n_es_sii_pending_count = fields.Integer(compute='_compute_l10n_es_sii_pending_count')
    l10n_es_sii_kanban_state = fields.Selection(
        selection=[
            ('error', "Error"),
            ('urgent', "Urgent"),
        ],
        compute='_compute_l10n_es_sii_pending_count',
    )

    def _get_l10n_es_sii_pending_domain(self):
        return [
            *self.env['account.move']._check_company_domain(self.env.companies),
            ('journal_id', 'in', self.ids),
            ('state', '=', 'posted'),
            ('move_type', 'in', ('out_invoice', 'out_refund', 'in_invoice', 'in_refund')),
            ('l10n_es_edi_is_required', '=', True),
            ('l10n_es_edi_sii_state', 'in', ('to_send', 'to_cancel')),
        ]

    def _get_l10n_es_sii_pending_move_query(self):
        query = self.env['account.move']._search(
            self._get_l10n_es_sii_pending_domain(),
            bypass_access=True,
        )
        move_table = query.table

        query.add_join(
            'LEFT JOIN LATERAL',
            'sii_doc',
            SQL("""(
                SELECT doc.response_message
                  FROM l10n_es_edi_sii_document doc
                 WHERE doc.move_id = %(move_id)s
              ORDER BY doc.create_date DESC, doc.id DESC
                 LIMIT 1
            )""", move_id=move_table.id),
            SQL("TRUE"),
        )

        return query, move_table, SQL.identifier('sii_doc', 'response_message')

    def _compute_l10n_es_sii_pending_count(self):
        sii_journals = self.filtered(
            lambda journal: journal.type in ('sale', 'purchase')
            and journal.company_id.account_fiscal_country_id.code == 'ES'
            and journal.company_id.l10n_es_sii_tax_agency
        )
        (self - sii_journals).l10n_es_sii_pending_count = 0
        (self - sii_journals).l10n_es_sii_kanban_state = False

        if not sii_journals:
            return

        query, move_table, doc_message = sii_journals._get_l10n_es_sii_pending_move_query()
        query.groupby = move_table.journal_id
        rows = self.env.execute_query(query.select(
            move_table.journal_id,
            SQL("COUNT(%s)", move_table.id),
            SQL("BOOL_OR(%s IS NOT NULL)", doc_message),
            SQL("BOOL_OR(%s <= (NOW() - INTERVAL '36 hours'))", move_table.date),
        ))
        results = {
            journal_id: {
                'pending_count': pending_count,
                'has_error': has_error,
                'has_urgent': has_urgent,
            }
            for journal_id, pending_count, has_error, has_urgent in rows
        }

        for journal in sii_journals:
            result = results.get(journal.id)
            if not result:
                journal.l10n_es_sii_pending_count = 0
                journal.l10n_es_sii_kanban_state = False
                continue

            journal.l10n_es_sii_pending_count = result['pending_count']
            if result['has_urgent']:
                journal.l10n_es_sii_kanban_state = 'urgent'
            elif result['has_error']:
                journal.l10n_es_sii_kanban_state = 'error'
            else:
                journal.l10n_es_sii_kanban_state = False

    def action_l10n_es_sii_open_pending(self):
        self.ensure_one()

        return {
            'type': 'ir.actions.act_window',
            'name': self.env._("Invoices to send to SII"),
            'res_model': 'account.move',
            'view_mode': 'list,form',
            'domain': self._get_l10n_es_sii_pending_domain(),
            'context': {
                'create': False,
            },
        }
