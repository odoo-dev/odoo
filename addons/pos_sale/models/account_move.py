from odoo import models


class AccountMove(models.Model):
    _inherit = "account.move"

    def _is_downpayment(self):
        self.ensure_one()
        if (sale_lines := self.pos_order_ids.lines.sale_order_line_id.filtered(lambda line: line.is_downpayment))\
        and self.line_ids.filtered(lambda line: line.product_id in sale_lines.product_id and line.price_subtotal > 0):
            return True

        return super()._is_downpayment()
