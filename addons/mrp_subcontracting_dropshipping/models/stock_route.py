from odoo import models


class StockRoute(models.Model):
    _inherit = 'stock.route'

    _stock_dropshipping__route_drop_shipping_optional = models.Ref('stock_dropshipping.route_drop_shipping', required=False)
