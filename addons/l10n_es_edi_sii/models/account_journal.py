# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import fields, models
from odoo.models import TableSQL
from odoo.tools import SQL


class AccountJournal(models.Model):
    _inherit = 'account.journal'

    l10n_es_sii_pending_count = fields.Integer(
        compute='_compute_l10n_es_sii_pending_count',
        compute_sql='_compute_sql_l10n_es_sii_pending_count',
        compute_sudo=True,
    )
    l10n_es_sii_kanban_state = fields.Selection(
        selection=[('error', 'Error'), ('urgent', 'Urgent')],
        compute='_compute_l10n_es_sii_pending_count',
        compute_sql='_compute_sql_l10n_es_sii_kanban_state',
        compute_sudo=True,
    )

    # -------------------------------------------------------------------------
    # COMPUTE SQL METHODS
    # -------------------------------------------------------------------------

    def _get_l10n_es_sii_sql_query(self, table):
        """ Helper method to build the base subquery used by both compute_sql methods.
            Takes inspiration from account.account's _compute_sql_used.
        """
        query = self.env['account.move']._search([
            ('state', '=', 'posted'),
            ('move_type', 'in', ('out_invoice', 'out_refund', 'in_invoice', 'in_refund')),
            ('company_id.l10n_es_sii_tax_agency', '!=', False),
        ])
        move_table = query.table

        query.add_where(SQL("%s = %s", move_table.journal_id, table.id))

        SIIDoc = self.env['l10n_es_edi_sii.document']
        doc = TableSQL('doc', SIIDoc, query)
        query.add_join('LEFT JOIN', doc, None, SQL("%s = %s", doc.move_id, move_table.id))

        doc_newer = TableSQL('doc_newer', SIIDoc, query)
        query.add_join('LEFT JOIN', doc_newer, None, SQL("%s = %s AND %s > %s", doc_newer.move_id, move_table.id, doc_newer.id, doc.id))

        query.add_where(SQL("%s IS NULL", doc_newer.id))
        query.add_where(SQL("%s IS NULL OR %s IN ('to_send', 'to_cancel')", doc.state, doc.state))

        return query, move_table, doc

    def _compute_sql_l10n_es_sii_pending_count(self, table):
        query, move_table, _doc = self._get_l10n_es_sii_sql_query(table)
        return SQL(
            "CASE WHEN %(journal_type)s IN ('sale', 'purchase') THEN COALESCE((%(subselect)s), 0) ELSE 0 END",
            journal_type=table.type,
            subselect=query.subselect(SQL("COUNT(%s)", move_table.id))
        )

    def _compute_sql_l10n_es_sii_kanban_state(self, table):
        query, move_table, doc = self._get_l10n_es_sii_sql_query(table)
        select_sql = SQL("""
            CASE
                WHEN MAX(CASE WHEN %(move_date)s <= (NOW() - INTERVAL '36 hours') THEN 1 ELSE 0 END) = 1 THEN 'urgent'
                WHEN MAX(CASE WHEN %(doc_state)s IN ('to_send', 'to_cancel') AND %(doc_message)s IS NOT NULL THEN 1 ELSE 0 END) = 1 THEN 'error'
                ELSE NULL
            END
        """,
        move_date=move_table.date,
        doc_state=doc.state,
        doc_message=doc.response_message)

        return SQL(
            "CASE WHEN %(journal_type)s IN ('sale', 'purchase') THEN (%(subselect)s) ELSE NULL END",
            journal_type=table.type,
            subselect=query.subselect(select_sql)
        )

    # -------------------------------------------------------------------------
    # COMPUTE METHODS
    # -------------------------------------------------------------------------

    def _compute_l10n_es_sii_pending_count(self):
        es_journals = self.filtered(
            lambda j: j.company_id.country_code == 'ES'
            and j.type in ('sale', 'purchase')
            and j.company_id.l10n_es_sii_tax_agency
        )
        (self - es_journals).l10n_es_sii_pending_count = 0
        (self - es_journals).l10n_es_sii_kanban_state = False

        if not es_journals:
            return

        SIIDoc = self.env['l10n_es_edi_sii.document']

        query = self.env['account.move']._search([
            ('journal_id', 'in', es_journals.ids),
            ('state', '=', 'posted'),
            ('move_type', 'in', ('out_invoice', 'out_refund', 'in_invoice', 'in_refund')),
            ('company_id.l10n_es_sii_tax_agency', '!=', False),
        ])

        move_table = query.table

        doc = TableSQL('doc', SIIDoc, query)
        query.add_join('LEFT JOIN', doc, None, SQL("%s = %s", doc.move_id, move_table.id))

        doc_newer = TableSQL('doc_newer', SIIDoc, query)
        query.add_join('LEFT JOIN', doc_newer, None, SQL("%s = %s AND %s > %s", doc_newer.move_id, move_table.id, doc_newer.id, doc.id))

        query.add_where(SQL("%s IS NULL", doc_newer.id))
        query.add_where(SQL("%s IS NULL OR %s IN ('to_send', 'to_cancel')", doc.state, doc.state))

        query.groupby = move_table.journal_id

        sql = query.select(
            move_table.journal_id,
            SQL("COUNT(%s) as pending_count", move_table.id),
            SQL("MAX(CASE WHEN %s IN ('to_send', 'to_cancel') AND %s IS NOT NULL THEN 1 ELSE 0 END) as has_error", doc.state, doc.response_message),
            SQL("MAX(CASE WHEN %s <= (NOW() - INTERVAL '36 hours') THEN 1 ELSE 0 END) as has_urgent", move_table.date)
        )

        rows = self.env.execute_query(sql)
        results = {
            row[0]: {
                'pending_count': row[1],
                'has_error': row[2],
                'has_urgent': row[3]
            } for row in rows
        }

        for journal in es_journals:
            res = results.get(journal.id)
            if not res:
                journal.l10n_es_sii_pending_count = 0
                journal.l10n_es_sii_kanban_state = False
                continue

            journal.l10n_es_sii_pending_count = res['pending_count']

            if res['has_urgent']:
                journal.l10n_es_sii_kanban_state = 'urgent'
            elif res['has_error']:
                journal.l10n_es_sii_kanban_state = 'error'
            else:
                journal.l10n_es_sii_kanban_state = False

    # -------------------------------------------------------------------------
    # ACTIONS
    # -------------------------------------------------------------------------

    def action_l10n_es_sii_open_pending(self):
        self.ensure_one()

        SIIDoc = self.env['l10n_es_edi_sii.document']

        query = self.env['account.move']._search([
            ('journal_id', '=', self.id),
            ('state', '=', 'posted'),
            ('move_type', 'in', ('out_invoice', 'out_refund', 'in_invoice', 'in_refund')),
            ('company_id.l10n_es_sii_tax_agency', '!=', False),
        ])

        move_table = query.table

        doc = TableSQL('doc', SIIDoc, query)
        query.add_join('LEFT JOIN', doc, None, SQL("%s = %s", doc.move_id, move_table.id))

        doc_newer = TableSQL('doc_newer', SIIDoc, query)
        query.add_join('LEFT JOIN', doc_newer, None, SQL("%s = %s AND %s > %s", doc_newer.move_id, move_table.id, doc_newer.id, doc.id))

        query.add_where(SQL("%s IS NULL", doc_newer.id))
        query.add_where(SQL("%s IS NULL OR %s IN ('to_send', 'to_cancel')", doc.state, doc.state))

        sql = query.select(move_table.id)
        move_ids = [row[0] for row in self.env.execute_query(sql)]

        return {
            'type': 'ir.actions.act_window',
            'name': self.env._('Invoices to send to SII'),
            'res_model': 'account.move',
            'view_mode': 'list,form',
            'domain': [('id', 'in', move_ids)],
            'context': {'create': False},
        }
