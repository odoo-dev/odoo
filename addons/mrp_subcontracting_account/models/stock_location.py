from odoo import models


class StockLocation(models.Model):
    _inherit = 'stock.location'

    def _should_be_valued(self):
        return super()._should_be_valued() and not self.is_subcontract()
