# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class StockPutInPack(models.TransientModel):
    _inherit = 'stock.put.in.pack'

    package_carrier_type = fields.Char('Carrier Type')
