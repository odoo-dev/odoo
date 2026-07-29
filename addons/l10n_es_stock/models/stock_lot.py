from odoo import fields, models


class StockLot(models.Model):
    _inherit = 'stock.lot'

    lot_purchase_price = fields.Float(string="Purchase Price")