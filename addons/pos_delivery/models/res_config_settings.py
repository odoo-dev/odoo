from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    pos_iface_pos_delivery = fields.Boolean(
        related='pos_config_id.iface_pos_delivery',
        readonly=False,
        string="POS Delivery Management"
    )
