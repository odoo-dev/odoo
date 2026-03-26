from odoo import models, api, fields


class PosPreset(models.Model):
    _inherit = "pos.preset"

    service_at = fields.Selection(
        [("counter", "Pickup zone"), ("table", "Table"), ("delivery", "Delivery")],
        string="Service at",
        default="counter",
        required=True,
    )

    @api.model
    def _load_pos_self_data_fields(self, config):
        params = super()._load_pos_self_data_fields(config)
        params.extend(['service_at'])
        return params
