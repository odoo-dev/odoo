# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class PosOrder(models.Model):
    _inherit = 'pos.order'

    l10n_in_irn = fields.Char(string="IRN", compute='_compute_l10n_in_irn')
    l10n_in_irn_qr_code_str = fields.Char(string="E-Invoice QR Code", compute='_compute_l10n_in_irn')

    @api.depends('account_move.l10n_in_edi_attachment_id')
    def _compute_l10n_in_irn(self):
        for order in self:
            response = order.to_invoice and order.sudo().account_move._get_l10n_in_edi_response_json()
            order.l10n_in_irn = response and response.get('Irn')
            order.l10n_in_irn_qr_code_str = response and response.get('SignedQRCode')

    def _generate_pos_order_invoice(self):
        # Without the PDF, super() skips _generate_and_send and so the e-invoice:
        # send it anyway as the IRN must be printed on the receipt.
        invoice = super()._generate_pos_order_invoice()
        if (
            not self.env.context.get('generate_pdf', True)
            and invoice.state == 'posted'
            and invoice.l10n_in_edi_status == 'to_send'
        ):
            invoice.sudo()._l10n_in_edi_send_invoice()
        return invoice
