from odoo import models


class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'

    def _get_downpayment_lines(self):
        downpayment_products = self.env['pos.config'].sudo().search([]).mapped('down_payment_product_id')
        downpayment_lines = self.filtered(lambda line: line.sale_line_ids.order_id.pos_order_line_ids and line.price_subtotal < 0 and line.product_id in downpayment_products)

        return super()._get_downpayment_lines() | downpayment_lines
