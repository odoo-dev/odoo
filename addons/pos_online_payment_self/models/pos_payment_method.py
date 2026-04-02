from odoo import api, models
from odoo.fields import Domain


class PosPaymentMethod(models.Model):
    _inherit = "pos.payment.method"

    @api.model
    def _load_pos_self_data_domain(self, data, config):
        super_domain = super()._load_pos_self_data_domain(data, config)

        online_payment_domain = self._get_pos_payment_method_online_domain(config)
        if not online_payment_domain:
            return super_domain

        return Domain.OR([online_payment_domain, super_domain])

    def _valid_self_ordering_mode(self, config):
        return False

    def _get_pos_payment_method_online_domain(self, config):
        if self._valid_self_ordering_mode(config):
            return Domain.AND([
                Domain('is_online_payment', '=', True),
                Domain('id', 'in', config.payment_method_ids.ids),
            ])
        return None
