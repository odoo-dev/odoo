# -*- coding: utf-8 -*-

from openerp import models, fields, api


class AccountJournalMergeWizard(models.TransientModel):

    _name = "account.journal.merge.wizard"

    from_journal_id = fields.Many2one(
        'account.journal',
        'From Journal',
        ondelete='cascade',
        required=True,
    )
    from_company_id = fields.Many2one(
        related='from_journal_id.company_id',
        readonly=True,
    )
    from_type = fields.Selection(
        related='from_journal_id.type',
        readonly=True,
    )
    to_journal_id = fields.Many2one(
        'account.journal',
        'To Journal',
        ondelete='cascade',
        required=True,
        domain="[('type', '=', from_type), ('id', '!=', from_journal_id), "
        "('company_id', '=', from_company_id)]",
    )
    delete_from_journal = fields.Boolean(default=True)

    @api.multi
    def confirm(self):
        self.ensure_one()
        self.env['account.journal'].merge_journals(
            self.from_journal_id, self.to_journal_id, self.delete_from_journal,
            do_not_raise=False)
        return True
