# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, fields, models


class MarketplaceLocation(models.Model):
    _name = 'marketplace.location'
    _description = "Marketplace Location"

    name = fields.Char(string="Name", readonly=True)
    marketplace_location_identifier = fields.Char(string="Marketplace Location Identifier", readonly=True)

    marketplace_account_id = fields.Many2one(
        comodel_name='marketplace.account',
        string="Marketplace Account",
        required=True,
        readonly=True,
        ondelete='restrict',
    )
    matched_location_id = fields.Many2one(
        comodel_name='stock.location',
        string="Stock Location",
        domain=[('usage', '=', 'internal')],
    )

    _unique_marketplace_account_marketplace_location_identifier = models.Constraint(
        "UNIQUE(marketplace_account_id, marketplace_location_identifier)",
        _("The marketplace location identifier must be unique per marketplace account.")
    )

    _unique_marketplace_account_matched_location_id = models.Constraint(
        "UNIQUE(marketplace_account_id, matched_location_id)",
        _("The matching location must be unique against an external location per marketplace account.")
    )

    def set_default_marketplace_location_id(self):
        self.marketplace_account_id.set_default_marketplace_location_id(self)
