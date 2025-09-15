from odoo import fields, models


class ResUsers(models.Model):
    _inherit = "res.users"

    active_marketplace_channel_ids = fields.Many2many(
        comodel_name="marketplace.channel",
        string="Purchased Marketplace Channels",
        help="Marketplace Channels that are in current plan of the user",
    )
