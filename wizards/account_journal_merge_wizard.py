# -*- coding: utf-8 -*-

from openerp import models, fields, api


class AccountJournalMergeWizard(models.TransientModel):

    _name = "account.journal.merge.wizard"

    from_journal_id = fields.Many2one(
        'account.journal',
        'From Journal',
        ondelete='cascade',
        required=True,
        domain=[('type', 'in', ['sale', 'purchase'])],
    )
    to_journal_id = fields.Many2one(
        'account.journal',
        'From Journal',
        ondelete='cascade',
        required=True,
        domain=[('type', 'in', ['sale', 'purchase'])],
    )
    delete_from_journal = fields.Boolean(default=True)

    @api.multi
    def confirm(self):
        self.ensure_one()
        self.env['account.journal'].merge_journals(
            self.from_journal_id, self.to_journal_id, self.delete_from_journal)
