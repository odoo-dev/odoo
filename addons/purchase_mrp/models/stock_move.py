# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, models, fields
from odoo.tools.float_utils import float_is_zero, float_round
from odoo.exceptions import UserError


class StockMove(models.Model):
    _inherit = 'stock.move'

    def _prepare_phantom_move_values(self, bom_line, product_qty, quantity_done):
        vals = super()._prepare_phantom_move_values(bom_line, product_qty, quantity_done)
        if self.purchase_line_id:
            vals['purchase_line_id'] = self.purchase_line_id.id
        return vals

    def _get_value_for_kit_product(self, value, quantity):
        purchase_product = self.purchase_line_id.product_id
        if purchase_product.is_kits and self.purchase_line_id.move_ids:
            boms = self.env['mrp.bom']._bom_find(purchase_product, company_id=self.company_id.id, bom_type='phantom')
            if purchase_product in boms:
                kit_bom = boms[purchase_product]
                bom_line = kit_bom.bom_line_ids.filtered(lambda bl: bl.product_id == self.product_id)
                if bom_line:
                    factor = self.purchase_line_id.product_uom_id.factor if self.purchase_line_id.product_uom_id != self.purchase_line_id.product_id.uom_id else 1
                    if quantity:
                        value = ((value * self.purchase_line_id.qty_received * factor) / quantity)
                        if any(kit_bom.bom_line_ids.mapped('cost_share')):
                            value = (value * bom_line.cost_share) / 100
                        else:
                            value = value/len(kit_bom.bom_line_ids)
        return value

    def _get_value_from_account_move(self, quantity, at_date=None):
        valuation_data = super()._get_value_from_account_move(quantity, at_date=at_date)
        valuation_data['value'] = self._get_value_for_kit_product(valuation_data['value'], valuation_data['quantity'])
        return valuation_data

    def _get_value_from_quotation(self, quantity, at_date=None):
        valuation_data = super()._get_value_from_quotation(quantity, at_date)
        valuation_data['value'] = self._get_value_for_kit_product(valuation_data['value'], valuation_data['quantity'])
        return valuation_data
