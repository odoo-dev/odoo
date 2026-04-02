from odoo import models


class PosPaymentMethod(models.Model):
    _inherit = "pos.payment.method"

    def _valid_self_ordering_mode(self, config):
        return config.self_ordering_mode == 'checkout' or super()._valid_self_ordering_mode(config)
