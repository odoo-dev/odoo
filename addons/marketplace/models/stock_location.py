# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class StockLocation(models.Model):
    _inherit = 'stock.location'

    marketplace_location_ids = fields.One2many(
        comodel_name='marketplace.location',
        inverse_name='matched_location_id',
        string="Marketplace Locations",
        help="List of marketplace warehouses/locations/sources that is associated with this stock location.",
    )
