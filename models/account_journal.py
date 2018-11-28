from odoo import fields, models, api, _
from odoo.exceptions import ValidationError
import logging
_logger = logging.getLogger(__name__)


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
        auto_join=True,
        index=True,
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
        auto_join=True,
    )
    journal_type = fields.Selection(
        related='journal_id.type',
        readonly=True,
    )
    sequence = fields.Integer(
        'Sequence',
        index=True,
    )
    next_number = fields.Integer(
        related='sequence_id.number_next_actual'
    )


class AccountJournal(models.Model):
    _inherit = "account.journal"

    localization = fields.Selection(
        related='company_id.localization',
        readonly=True,
    )
    journal_document_type_ids = fields.One2many(
        'account.journal.document.type',
        'journal_id',
        'Documents Types',
        auto_join=True,
    )
    use_documents = fields.Boolean(
        'Use Documents?',
    )
    document_sequence_type = fields.Selection(
        # TODO this field could go in argentina localization
        [('own_sequence', 'Own Sequence'),
            ('same_sequence', 'Same Invoice Sequence')],
        string='Document Sequence Type',
        default='own_sequence',
        required=False,
        help="Use own sequence or invoice sequence on Debit and Credit Notes?",
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
            raise ValidationError(_('Type %s not implemented yet' % self.type))

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

    @api.model
    def merge_journals(
            self, from_journal, to_journal, delete_from=True,
            do_not_raise=True):
        cr = self.env.cr

        if from_journal.type in ('bank', 'cash') and self.env[
                'account.bank.statement'].search([
                    ('journal_id', '=', from_journal.id)]):
            raise ValidationError(_(
                'Can not merge from a journal that has cash/bank statements'))

        if from_journal.type != to_journal.type:
            raise ValidationError(_(
                'Journals Must be of the same type'))

        if from_journal.company_id != to_journal.company_id:
            raise ValidationError(_(
                'Journals Must be of the same company'))

        if from_journal == to_journal:
            raise ValidationError(_(
                'Journals can not be the same'))

        def get_repeated_types(from_journal, to_journal):
            from_types = from_journal.journal_document_type_ids.mapped(
                'document_type_id')
            to_types = to_journal.journal_document_type_ids.mapped(
                'document_type_id')
            return from_types & to_types

        if from_journal.type in ['sale', 'purchase']:
            repeated_types = get_repeated_types(from_journal, to_journal)

            rep_journal_docs = self.env[
                'account.journal.document.type'].search([
                    ('journal_id', 'in', [from_journal.id, to_journal.id]),
                    ('document_type_id', 'in', repeated_types.ids)])
            for rep_journal_doc in rep_journal_docs:
                try:
                    rep_journal_doc.unlink()
                    rep_journal_doc.\
                        _cr.commit()  # pylint: disable=invalid-commit
                except Exception:
                    # TODO mejorar log que nos daba error
                    _logger.info('Could not unlink doc type')

            # TODO mejorar y tratar de evitar esto
            self._cr.commit()  # pylint: disable=invalid-commit
            from_journal.invalidate_cache()
            to_journal.invalidate_cache()
            repeated_types = get_repeated_types(from_journal, to_journal)

            if repeated_types:
                msg = (
                    'Could not merge journal %s into journal %s because we '
                    'could not delete the following repeated types: %s' % (
                        from_journal.name, to_journal.name,
                        repeated_types.mapped('name')))
                if do_not_raise:
                    _logger.warning(msg)
                else:
                    raise ValidationError(msg)

        tables = [
            'account_move', 'account_move_line', 'account_invoice']
        if from_journal.type in ['sale', 'purchase']:
            tables.append('account_journal_document_type')
        elif from_journal.type in ['bank', 'cash']:
            tables.append('account_payment')

        for table in tables:
            cr.execute("""
                UPDATE
                    %s
                SET
                    journal_id=%s
                WHERE journal_id = %s
                """, (table, to_journal.id, from_journal.id))
        if delete_from:
            from_journal.unlink()

    @api.constrains('use_documents')
    def check_use_document(self):
        for rec in self:
            if rec.env['account.invoice'].search(
                    [('journal_id', '=', rec.id)]):
                raise ValidationError(_(
                    'You can not modify the field "Use Documents?"'
                    ' if invoices already exist in the journal!'))
