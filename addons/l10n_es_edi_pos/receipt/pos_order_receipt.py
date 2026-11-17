# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import models

from odoo.addons.l10n_es_edi_pos.models.res_company import POS_FISCAL_MODES_SIMPLIFIED_SEQUENCE


class PosOrderReceipt(models.AbstractModel):
    _inherit = 'pos.order.receipt'

    def order_receipt_generate_data(self, basic_receipt=False):
        # EXTENDS 'point_of_sale'
        # Mirrored in JS by the patch of `GeneratePrinterData.generateReceiptData`.
        data = super().order_receipt_generate_data(basic_receipt)
        fiscal_mode = self.company_id._l10n_es_pos_get_fiscal_mode()
        if not fiscal_mode:
            return data

        # The generic partner of the simplified invoices carries no information for the customer.
        simplified_partner = self.env.ref('l10n_es.partner_simplified', raise_if_not_found=False)
        if simplified_partner and self.partner_id == simplified_partner:
            data['partner'] = False

        # TicketBAI numbers its simplified invoices with `pos_reference`, already in the header.
        if fiscal_mode in POS_FISCAL_MODES_SIMPLIFIED_SEQUENCE:
            invoice_name = self._l10n_es_pos_get_invoice_name()
            data['conditions']['l10n_es_pos_invoice_name'] = bool(invoice_name)
            data['conditions']['l10n_es_pos_simplified_invoice'] = bool(self.sequence_number) and not self.is_singly_invoiced
            data['extra_data']['l10n_es_pos_invoice_name'] = invoice_name
        return data