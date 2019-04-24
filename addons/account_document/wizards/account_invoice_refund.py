
from odoo import models, fields, api, _
from odoo.exceptions import UserError
from odoo.addons.account.models.account_invoice import TYPE2REFUND


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
        compute='_compute_available_journal_document_types',
        string='Available Journal Document Types',
    )

    @api.multi
    def onchange(self, values, field_name, field_onchange):
        """
        Idea obtenida de aca
        https://github.com/odoo/odoo/issues/16072#issuecomment-289833419
        por el cambio que se introdujo en esa mimsa conversación, TODO en v11
        no haría mas falta, simplemente domain="[('id', 'in', x2m_field)]"
        Otras posibilidades que probamos pero no resultaron del todo fue:
        * agregar onchange sobre campos calculados y que devuelvan un dict con
        domain. El tema es que si se entra a un registro guardado el onchange
        no se ejecuta
        * usae el modulo de web_domain_field que esta en un pr a la oca
        """
        for field in field_onchange.keys():
            if field.startswith('available_journal_document_type_ids.'):
                del field_onchange[field]
        return super(AccountInvoiceRefund, self).onchange(
            values, field_name, field_onchange)

    @api.multi
    @api.depends('invoice_id')
    def _compute_available_journal_document_types(self):
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
            refund_journal_document_type_id=self.journal_document_type_id.id,
            refund_document_number=self.document_number,
        )).compute_refund(mode=mode)
