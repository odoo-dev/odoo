from odoo import fields, models


class SaleOrder(models.Model):
    _inherit = 'sale.order.line'

    edi_product_ref = fields.Char()

    def _set_edi_product_ref_on_product(self):
        self.ensure_one()
        customer = self.order_id.partner_id
        product = self.product
        customer_product_ref = self.edi_product_ref
