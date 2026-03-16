# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class SaleOrderTemplateLine(models.Model):
    _inherit = "sale.order.template.line"

    purchase_price = fields.Float(string="Unit Cost", min_display_digits="Product Price")

    def _prepare_order_line_values(self):
        vals = super()._prepare_order_line_values()
        if not self.product_id:
            vals["purchase_price"] = self.purchase_price

        return vals
