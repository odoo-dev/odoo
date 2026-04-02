from odoo import models
from odoo.fields import Domain


class PosPaymentMethod(models.Model):
    _inherit = "pos.payment.method"

    def _get_pos_payment_method_online_domain(self, config):
        res = super()._get_pos_payment_method_online_domain(config)
        if res is None and config.self_order_online_payment_method_id:
            return Domain('id', '=', config.self_order_online_payment_method_id.id)
        return res

    def _valid_self_ordering_mode(self, config):
        return config.self_ordering_mode == 'kiosk' or super()._valid_self_ordering_mode(config)
