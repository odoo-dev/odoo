from odoo import models


class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'

    def _l10n_sa_is_reward_line(self):
        discount_lines = self._get_discount_lines()
        if (not discount_lines and not self.is_downpayment) or not hasattr(self.env['pos.order.line'], 'is_reward_line') or not any(line.is_reward_line for line in self.move_id.pos_order_ids.lines):
            return super()._l10n_sa_is_reward_line()

        lines = discount_lines
        if self.is_downpayment:
            lines |= self
        base_lines, _ = lines.move_id._get_rounded_base_and_tax_lines()
        base_line = next((line for line in base_lines if line['id'] == self.id), False)
        if not base_line:
            return False

        # Assuming that discount lines that aren't global discounts or down payments are reward lines
        if base_line.get('computation_key') not in ('global_discount', 'down_payment'):
            return True

        # For global_discount or down_payment lines: if no taxes on this line and all product lines
        # in the order have taxes, assume it relates to a reward line
        pos_orders = self.move_id.pos_order_ids
        discount_products = pos_orders.config_id.mapped('discount_product_id')
        product_lines = pos_orders.lines.filtered(lambda line: not line.is_reward_line and line.product_id not in discount_products)
        return not self.tax_ids and all(line.tax_ids for line in product_lines)
