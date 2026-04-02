# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class PaymentTransaction(models.Model):
    _inherit = 'payment.transaction'

    def _is_source_valid(self):
        self.ensure_one()
        return (self.pos_order_id and self.pos_order_id.source in ('mobile', 'kiosk')) or super()._is_source_valid()
