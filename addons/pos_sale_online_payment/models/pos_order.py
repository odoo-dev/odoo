# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class PosOrder(models.Model):
    _inherit = 'pos.order'

    def action_pos_order_paid(self):
        res = super().action_pos_order_paid()
        # Link POS payment method on pre-paid account payments for sale order settlement payments.
        for payment in self.payment_ids:
            if payment.payment_method_id.use_sale_order_payment and not payment.online_account_payment_id.pos_payment_method_id:
                payment.online_account_payment_id.pos_payment_method_id = payment.payment_method_id
        return res
