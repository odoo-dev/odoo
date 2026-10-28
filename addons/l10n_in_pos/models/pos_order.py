import re
from collections import defaultdict

from odoo import api, fields, models


class PosOrder(models.Model):
    _inherit = 'pos.order'

    l10n_in_b2c_invoice_number = fields.Char(
        string="B2C Invoice Number",
        readonly=True,
        copy=False,
        index='btree_not_null',
        help="Number reported to the GST portal for an order of a consumer, as such orders are not invoiced one by one.",
    )

    def action_pos_order_paid(self):
        res = super().action_pos_order_paid()
        if not self.l10n_in_b2c_invoice_number and self._l10n_in_is_b2c_order():
            sequence = self.config_id._l10n_in_get_b2c_sequence(is_refund=self.is_refund_or_negative())
            self.l10n_in_b2c_invoice_number = sequence._next()
        return res

    def _l10n_in_is_b2c_order(self):
        """ Orders of consumers end up in the session closing entry, whose number
        is shared by all of them, so they need a number of their own.
        """
        self.ensure_one()
        if not self.company_id.l10n_in_gst_registration_type or self.to_invoice:
            return False
        partner = self.partner_id.commercial_partner_id
        if not partner:
            return True
        # Same fallback as the GST treatment of an invoice.
        gst_treatment = partner.l10n_in_gst_treatment or (
            'overseas' if partner.country_id and partner.country_id.code != 'IN'
            else (partner.check_vat_in(partner.vat) and 'regular') or 'consumer'
        )
        return gst_treatment == 'consumer'

    @api.model
    def _l10n_in_get_b2c_document_summary(self, companies, date_from, date_to):
        """ Ranges of B2C numbers for GSTR-1 Table 13, one per prefix.
        An order belongs to the period of the closing entry that reports its taxes.
        """
        orders = self.sudo().search_fetch([
            ('company_id', 'in', companies.ids),
            ('l10n_in_b2c_invoice_number', '!=', False),
            ('account_move.date', '>=', date_from),
            ('account_move.date', '<=', date_to),
        ], ['l10n_in_b2c_invoice_number', 'is_refund', 'amount_total'])

        numbers_by_prefix = defaultdict(list)
        for order in orders:
            number = order.l10n_in_b2c_invoice_number
            prefix, digits = re.match(r'^(.*?)(\d*)$', number).groups()
            nature_of_document = '5' if order.is_refund_or_negative() else '1'  # Credit Note / Invoice
            numbers_by_prefix[nature_of_document, prefix].append((int(digits or 0), number))

        summary = []
        for (nature_of_document, _prefix), numbers in numbers_by_prefix.items():
            numbers.sort()
            summary.append({
                'nature_of_document': nature_of_document,
                'serial_from': numbers[0][1],
                'serial_to': numbers[-1][1],
                'total_issued': len(numbers),
                'total_cancelled': 0,
            })
        return summary

    def _grouping_function(self, line):
        res = super()._grouping_function(line)  # Returns mappingproxy (immutable)
        if self.config_id.company_id.l10n_in_gst_registration_type:
            res = dict(res)  # Convert to mutable dict
            res['l10n_in_hsn_code'] = line.get('l10n_in_hsn_code', '')
            res['product_uom_id'] = line.get('product_uom_id', '')
        return res

    def _prepare_account_move_line_data(self, aggregate=True):
        lines = super()._prepare_account_move_line_data(aggregate)
        if aggregate:
            return lines

        for line in lines:
            move = line.get('account.move.line')
            meta = line.get('metadata')

            if self.config_id.company_id.l10n_in_gst_registration_type and meta:
                pos_line = meta.get('line') if meta else None
                if not pos_line:
                    continue
                move["l10n_in_hsn_code"] = pos_line.l10n_in_hsn_code
                move["product_uom_id"] = pos_line.product_uom_id.id

        return lines

    def _prepare_move_line_vals_from_base_line(self, base_line):
        values = super()._prepare_move_line_vals_from_base_line(base_line)
        if self.config_id.company_id.l10n_in_gst_registration_type:
            values["l10n_in_hsn_code"] = base_line.get("l10n_in_hsn_code", "")
            values["product_uom_id"] = base_line.get("product_uom_id", "").id
        return values
