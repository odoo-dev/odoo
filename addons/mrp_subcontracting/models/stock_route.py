from odoo import models


class StockRoute(models.Model):
    _inherit = 'stock.route'

    _mrp_subcontracting__route_resupply_subcontractor_mto = models.Ref('mrp_subcontracting.route_resupply_subcontractor_mto', required=False)
