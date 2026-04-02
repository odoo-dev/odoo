from odoo import models, api


class PosPaymentMethod(models.Model):
    _inherit = "pos.payment.method"

    @api.model
    def _load_pos_self_data_domain(self, data, config):
        if config.self_ordering_mode == 'kiosk':
            return [('payment_provider', '!=', False), ('id', 'in', config.payment_method_ids.ids)]
        return super()._load_pos_self_data_domain(data, config)
