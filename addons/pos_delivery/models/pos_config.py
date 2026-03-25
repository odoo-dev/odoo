from odoo import fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    iface_pos_delivery = fields.Boolean(
        string="POS Delivery Management",
        help="Enable the Delivery Management Screen in the POS interface.",
        default=True
    )
