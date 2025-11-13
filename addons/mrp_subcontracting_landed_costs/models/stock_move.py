from odoo import models


class StockMove(models.Model):
    _inherit = 'stock.move'

    def _get_move_ids(self):
        self.ensure_one()
        move_ids = super()._get_move_ids()
        subcontracted_productions = self._get_subcontract_production()
        if self.is_subcontract and subcontracted_productions:
            move_ids |= subcontracted_productions.move_finished_ids
        return move_ids
