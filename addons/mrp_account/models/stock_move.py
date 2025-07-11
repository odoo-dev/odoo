# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from collections import defaultdict

from odoo import models


class StockMove(models.Model):
    _inherit = "stock.move"

    def _get_value(self, forced_std_price=False):
        self.ensure_one()
        if self.production_id:
            valued_qty = sum(self._get_in_move_lines().mapped('quantity'))
            return self._get_value_from_production(valued_qty), valued_qty
        return super()._get_value(forced_std_price)

    def _get_value_from_production(self, quantity):
        # TODO: Maybe move _cal_price here
        self.ensure_one()
        return quantity * self.price_unit

    def _get_all_related_sm(self, product):
        moves = super()._get_all_related_sm(product)
        return moves | self.filtered(
            lambda m:
            m.bom_line_id.bom_id.type == 'phantom' and
            m.bom_line_id.bom_id == moves.bom_line_id.bom_id
        )
