# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields, api


class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'

    # ------------------
    # Fields declaration
    # ------------------

    # --------------------------------
    # Compute, inverse, search methods
    # --------------------------------

    # ----------------
    # Business methods
    # ----------------

    def _l10n_ph_edi_make_line_information(self, invoice_data_dict):
        """ Fill the provided data dict with the information of the given party. """
        self.ensure_one()
        if 'ItemList' not in invoice_data_dict:
            invoice_data_dict['ItemList'] = []

        if self.discount == 100.0:
            gross_price_subtotal = self.currency_id.round(self.price_unit * self.quantity)
        else:
            gross_price_subtotal = self.currency_id.round(self.price_subtotal / (1 - self.discount / 100.0))

        line_data = {
            "Nm": self.name,
            "Desc": self.l10n_ph_edi_description,
            "Qty": self.quantity,
            "Unit": self.product_uom_id.name,
            "UnitCost": self.price_unit,
            "SalesAmt": gross_price_subtotal,  # Excluding discounts
            "RegDscntAmt": 0.0,
            "SpeDscntAmt": 0.0,
            "NetSales": self.price_subtotal,  # Including discounts
        }

        # Handle both discounts
        for discount, amount in [('RegDscntAmt', self.l10n_ph_edi_regular_discount), ('SpeDscntAmt', self.l10n_ph_edi_special_discount)]:
            if amount:
                if amount == 100.0:
                    gross_price_subtotal = self.currency_id.round(self.price_unit * self.quantity)
                else:
                    gross_price_subtotal = self.currency_id.round(self.price_subtotal / (1 - amount / 100.0))
                line_data[discount] = gross_price_subtotal - self.price_subtotal

        invoice_data_dict['ItemList'].append(line_data)
