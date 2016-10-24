# -*- coding: utf-8 -*-
from openerp import fields, models, api, _
from openerp.exceptions import UserError


class AccountJournalDocumentType(models.Model):
    _name = "account.journal.document.type"
    _description = "Journal Document Types Mapping"
    _rec_name = 'document_type_id'
    _order = 'journal_id desc, sequence, id'

    document_type_id = fields.Many2one(
        'account.document.type',
        'Document Type',
        required=True,
        ondelete='cascade',
    )
    sequence_id = fields.Many2one(
        'ir.sequence',
        'Entry Sequence',
        help="This field contains the information related to the numbering of "
        "the documents entries of this document type."
    )
    journal_id = fields.Many2one(
        'account.journal',
        'Journal',
        required=True,
        ondelete='cascade',
    )
    journal_type = fields.Selection(
        related='journal_id.type',
        readonly=True,
    )
    sequence = fields.Integer(
        'Sequence',
    )


class AccountJournal(models.Model):
    _inherit = "account.journal"

    localization = fields.Selection(
        related='company_id.localization'
    )
    journal_document_type_ids = fields.One2many(
        'account.journal.document.type',
        'journal_id',
        'Documents Types',
    )
    use_documents = fields.Boolean(
        'Use Documents?'
    )
    document_sequence_type = fields.Selection(
        # TODO this field could go in argentina localization
        [('own_sequence', 'Own Sequence'),
            ('same_sequence', 'Same Invoice Sequence')],
        string='Document Sequence Type',
        default='own_sequence',
        required=True,
        help="Use own sequence or invoice sequence on Debit and Credit Notes?"
    )

    @api.onchange('company_id', 'type')
    def change_company(self):
        # TODO perhups we can use this also in payments
        if self.type in ['sale', 'purchase'] and self.company_id.localization:
            self.use_documents = True
        else:
            self.use_documents = False

    @api.multi
    @api.constrains(
        'code',
        'company_id',
        'use_documents',
    )
    def update_journal_document_types(self):
        """
        Tricky constraint to create documents on journal.
        You should not inherit this function, inherit
        "_update_journal_document_types" instead
        """
        return self._update_journal_document_types()

    @api.multi
    def _update_journal_document_types(self):
        """
        Function to be inherited by different localizations
        """
        self.ensure_one()
        if self.localization != 'generic':
            return True

        if not self.use_documents:
            return True

        if self.type in ['purchase', 'sale']:
            internal_types = ['invoice', 'debit_note', 'credit_note']
        else:
            raise UserError(_('Type %s not implemented yet' % self.type))

        document_types = self.env['account.document.type'].search([
            ('internal_type', 'in', internal_types),
            ('localization', '=', self.localization),
        ])

        # take out documents that already exists
        document_types = document_types - self.mapped(
            'journal_document_type_ids.document_type_id')

        sequence = 10
        for document_type in document_types:
            sequence_id = False
            if self.type == 'sale':
                # Si es nota de debito nota de credito y same sequence,
                # no creamos la secuencia, buscamos una que exista
                if (
                        document_type.internal_type in [
                        'debit_note', 'credit_note'] and
                        self.document_sequence_type == 'same_sequence'
                ):
                    journal_document = self.journal_document_type_ids.search([
                        ('journal_id', '=', self.id)], limit=1)
                    sequence_id = journal_document.sequence_id.id
                else:
                    sequence_id = self.env['ir.sequence'].create(
                        document_type.get_document_sequence_vals(self)).id
            self.journal_document_type_ids.create({
                'document_type_id': document_type.id,
                'sequence_id': sequence_id,
                'journal_id': self.id,
                'sequence': sequence,
            })
            sequence += 10
        return True
