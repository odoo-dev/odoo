# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields, api, _
from odoo.exceptions import UserError
from odoo.addons.account.models.account_invoice import TYPE2REFUND


class AccountInvoiceRefund(models.TransientModel):

    _inherit = "account.invoice.refund"

    @api.model
    def _get_l10n_latam_invoice_id(self):
        context = dict(self._context or {})
        active_id = context.get('active_id', False)
        if active_id:
            return self.env['account.invoice'].browse(active_id)

    l10n_latam_invoice_id = fields.Many2one(
        'account.invoice',
        'Invoice',
        default=_get_l10n_latam_invoice_id,
    )
    l10n_latam_use_documents = fields.Boolean(
        related='l10n_latam_invoice_id.journal_id.l10n_latam_use_documents',
        readonly=True,
    )
    l10n_latam_document_type_id = fields.Many2one(
        'l10n_latam.document.type',
        'Document Type',
        ondelete='cascade',
    )
    l10n_latam_sequence_id = fields.Many2one(
        'ir.sequence',
        compute='_compute_l10n_latam_sequence',
    )
    l10n_latam_document_number = fields.Char(
        string='Document Number',
    )
    l10n_latam_available_document_type_ids = fields.Many2many(
        'l10n_latam.document.type',
        compute='_compute_l10n_latam_available_document_types',
        string='Available Journal Document Types',
    )

    @api.depends('l10n_latam_invoice_id')
    def _compute_l10n_latam_available_document_types(self):
        for rec in self.filtered('l10n_latam_invoice_id'):
            invoice = rec.l10n_latam_invoice_id
            invoice_type = TYPE2REFUND[invoice.type]
            res = invoice._get_available_document_types(
                invoice.journal_id, invoice_type, invoice.partner_id)
            rec.l10n_latam_available_document_type_ids = res[
                'available_document_types']
            rec.l10n_latam_document_type_id = res[
                'document_type']

    @api.multi
    def compute_refund(self, mode='refund'):
        return super(AccountInvoiceRefund, self.with_context(
            refund_document_type_id=self.l10n_latam_document_type_id.id,
            refund_document_number=self.l10n_latam_document_number,
        )).compute_refund(mode=mode)

    @api.depends('l10n_latam_document_type_id')
    def _compute_l10n_latam_sequence(self):
        for rec in self:
            rec.l10n_latam_sequence_id = \
                rec.l10n_latam_invoice_id.journal_id.\
                    get_document_type_sequence(rec)

    @api.onchange('l10n_latam_document_number', 'l10n_latam_document_type_id')
    def _onchange_l10n_latam_document_number(self):
        if self.l10n_latam_document_type_id:
            l10n_latam_document_number = \
                self.l10n_latam_document_type_id._format_document_number(
                    self.l10n_latam_document_number)
            if self.l10n_latam_document_number != l10n_latam_document_number:
                self.l10n_latam_document_number = l10n_latam_document_number
