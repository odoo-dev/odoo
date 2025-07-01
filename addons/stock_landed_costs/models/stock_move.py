from odoo import models


class StockMove(models.Model):
    _inherit = "stock.move"

    def _get_landed_cost(self):
        domain = [('move_id', 'in', self.ids), ('cost_id.state', '=', 'done')]
        landed_cost_group = self.env['stock.valuation.adjustment.lines']._read_group(domain, ['move_id'], ['id:recordset'])
        return dict(landed_cost_group)

    def _get_value_from_account_move(self, quantity):
        self.ensure_one()
        value, quantity = super()._get_value_from_account_move(quantity)
        # Add landed costs value
        lc = self._get_landed_cost()
        extra_value = sum(lc[self].mapped('additional_landed_cost'))
        return value + extra_value, quantity
