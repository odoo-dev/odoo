from odoo import api, models


class ProductRemoval(models.Model):
    _name = 'product.removal'
    _inherit = ['product.removal', 'pos.load.mixin']

    @api.model
    def _load_pos_data_fields(self, config):
        return ['method']

    @api.model
    def _load_pos_data_domain(self, data, config):
        removal_strategy_ids = {product_cat['removal_strategy_id'] for product_cat in data['product.category'] if product_cat.get('removal_strategy_id')}
        return [('id', 'in', list(removal_strategy_ids))]
