# -*- coding: utf-8 -*-

from openerp import models, fields, api, _
from openerp.exceptions import UserError
from openerp.addons.account.models.account_invoice import TYPE2REFUND


class AccountInvoiceRefund(models.TransientModel):
    """Refunds invoice"""

    _inherit = "account.invoice.refund"

    @api.model
    def _get_invoice_id(self):
        invoice = self.env['account.invoice'].browse(
            self._context.get('active_ids', False))
        # we dont force one for compatibility with already running dsbs
        if len(invoice) > 1:
            raise UserError(_(
                'Refund wizard must be call only from one invoice'))
        return invoice

    invoice_id = fields.Many2one(
        'account.invoice',
        'Invoice',
        default=_get_invoice_id,
    )
    use_documents = fields.Boolean(
        related='invoice_id.journal_id.use_documents',
        string='Use Documents?',
        readonly=True,
    )
    journal_document_type_id = fields.Many2one(
        'account.journal.document.type',
        'Document Type',
        ondelete='cascade',
    )
    document_sequence_id = fields.Many2one(
        related='journal_document_type_id.sequence_id',
        readonly=True,
    )
    document_number = fields.Char(
        string='Document Number',
    )
    available_journal_document_type_ids = fields.Many2many(
        'account.journal.document.type',
        compute='get_available_journal_document_types',
        string='Available Journal Document Types',
    )

    @api.multi
    @api.depends('invoice_id')
    def get_available_journal_document_types(self):
        for rec in self:
            invoice = rec.invoice_id
            if not invoice:
                return True
            invoice_type = TYPE2REFUND[invoice.type]
            res = invoice._get_available_journal_document_types(
                invoice.journal_id, invoice_type, invoice.partner_id)
            rec.available_journal_document_type_ids = res[
                'available_journal_document_types']
            rec.journal_document_type_id = res[
                'journal_document_type']

    @api.multi
    def compute_refund(self, mode='refund'):
        return super(AccountInvoiceRefund, self.with_context(
            default_journal_document_type_id=self.journal_document_type_id.id,
            default_document_number=self.document_number,
        )).compute_refund(mode=mode)
