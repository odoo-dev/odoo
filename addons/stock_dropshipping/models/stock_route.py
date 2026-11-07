from odoo import models


class StockRoute(models.Model):
    _inherit = 'stock.route'

    _route_drop_shipping = models.Ref('stock_dropshipping.route_drop_shipping', required=False)
    _stock_dropshipping__route_drop_shipping = models.Ref('stock_dropshipping.route_drop_shipping')
