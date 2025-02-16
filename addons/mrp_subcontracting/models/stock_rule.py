# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class StockRule(models.Model):
    _inherit = "stock.rule"

    def _push_prepare_move_copy_values(self, move_to_copy, new_date):
        new_move_vals = super(StockRule, self)._push_prepare_move_copy_values(move_to_copy, new_date)
        new_move_vals["is_subcontract"] = False
        return new_move_vals


class ProcurementGroup(models.Model):
    _inherit = 'procurement.group'

    def _get_product_routes(self, product, valid_route_ids, warehouse_id):
        valid_route_ids = super()._get_product_routes(product, valid_route_ids, warehouse_id)
        if not valid_route_ids:
            return self.env["stock.route"]
        resupply_subcontractor_routes = self.env['stock.rule'].search([('action', '=', 'pull'), ('picking_type_id.code', '=', 'internal'), ('location_src_id.is_subcontracting_location', '=', True), ('active', '=', True)]).route_id.ids
        has_subcontract_bom = any(bom_line.bom_id.type == 'subcontract' for bom_line in product.bom_line_ids)
        if not has_subcontract_bom and not any(route_id in product.route_ids.ids for route_id in resupply_subcontractor_routes):
            valid_route_ids -= set(resupply_subcontractor_routes)
        return valid_route_ids
