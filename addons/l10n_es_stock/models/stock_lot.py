from odoo import api, fields, models


class StockLot(models.Model):
    _inherit = 'stock.lot'

    lot_purchase_price = fields.Float(string="Purchase Price")

    @api.model
    def _load_pos_data_domain(self, data, config):
        product_ids = [p['id'] for p in data['product.product']]
        return [('product_id', 'in', product_ids)]

    @api.model
    def _load_pos_data_fields(self, config):
        return ['id', 'name', 'product_id', 'standard_price']
