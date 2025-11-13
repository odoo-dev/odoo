from odoo import api, models


class StockMove(models.Model):
    _inherit = "stock.move"

    @api.depends('is_subcontract')
    def _compute_is_in(self):
        """ Extend to add more depends values """
        super()._compute_is_in()

    def _is_in(self):
        self.ensure_one()
        return super()._is_in() or self.is_subcontract
