##############################################################################
# For copyright and license notices, see __manifest__.py file in module root
# directory
##############################################################################
from odoo import models, fields, api
import logging
_logger = logging.getLogger(__name__)


class AccountPaymentReceiptbook(models.Model):

    _name = 'account.payment.receiptbook'
    _description = 'Account payment Receiptbook'
    # analogo a account.journal.document.type pero para pagos
    _order = 'sequence asc'

    sequence = fields.Integer(
        'Sequence',
        help="Used to order the receiptbooks",
        default=10,
    )
    name = fields.Char(
        'Name',
        size=64,
        required=True,
        index=True,
    )
    partner_type = fields.Selection(
        [('customer', 'Customer'), ('supplier', 'Vendor')],
        required=True,
        index=True,
    )
    next_number = fields.Integer(
        related='sequence_id.number_next_actual'
    )

    # payment_type = fields.Selection(
    #     [('inbound', 'Inbound'), ('outbound', 'Outbound')],
    #     # [('receipt', 'Receipt'), ('payment', 'Payment')],
    #     string='Type',
    #     required=True,
    # )
    # lo dejamos solo como ayuda para generar o no la secuencia pero lo que
    # termina definiendo si es manual o por secuencia es si tiene secuencia
    sequence_type = fields.Selection(
        [('automatic', 'Automatic'), ('manual', 'Manual')],
        string='Sequence Type',
        readonly=False,
        default='automatic',
    )
    sequence_id = fields.Many2one(
        'ir.sequence',
        'Entry Sequence',
        help="This field contains the information related to the numbering "
        "of the receipt entries of this receiptbook.",
        copy=False,
    )
    company_id = fields.Many2one(
        'res.company',
        'Company',
        required=True,
        default=lambda self: self.env[
            'res.company']._company_default_get('account.payment.receiptbook')
    )
    prefix = fields.Char(
        'Prefix',
        # required=True,
        # TODO rename field to prefix
    )
    padding = fields.Integer(
        'Number Padding',
        help="automatically adds some '0' on the left of the 'Number' to get "
        "the required padding size."
    )
    active = fields.Boolean(
        'Active',
        default=True,
    )
    document_type_id = fields.Many2one(
        'account.document.type',
        'Document Type',
        required=True,
    )

    @api.multi
    def write(self, vals):
        """
        If user change prefix we change prefix of sequence.
        TODO: we can use related field but we need to implement manual
        receipbooks with sequences. We should also make padding
        related to sequence
        """
        prefix = vals.get('prefix')
        for rec in self:
            if prefix and rec.sequence_id:
                rec.sequence_id.prefix = prefix
        return super(AccountPaymentReceiptbook, self).write(vals)

    @api.model
    def create(self, vals):
        sequence_type = vals.get(
            'sequence_type',
            self._context.get('default_sequence_type', False))
        prefix = vals.get(
            'prefix',
            self._context.get('default_prefix', False))
        company_id = vals.get(
            'company_id',
            self._context.get('default_company_id', False))

        if (
                sequence_type == 'automatic' and
                not vals.get('sequence_id', False) and
                company_id):
            seq_vals = {
                'name': vals['name'],
                'implementation': 'no_gap',
                'prefix': prefix,
                'padding': 8,
                'number_increment': 1
            }
            sequence = self.env['ir.sequence'].sudo().create(seq_vals)
            vals.update({
                'sequence_id': sequence.id
            })
        return super(AccountPaymentReceiptbook, self).create(vals)
