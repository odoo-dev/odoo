# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class ProductSupplierinfo(models.Model):
    _inherit = 'product.supplierinfo'

    is_subcontractor = fields.Boolean('Subcontracted', compute='_compute_is_subcontractor', help="Choose a vendor of type subcontractor if you want to subcontract the product")

    @api.depends('partner_id', 'product_id', 'product_tmpl_id')
    def _compute_is_subcontractor(self):
        for supplier in self:
            boms = supplier.product_id.variant_bom_ids
            boms |= supplier.product_tmpl_id.bom_ids.filtered(lambda b: not b.product_id or b.product_id in (supplier.product_id or supplier.product_tmpl_id.product_variant_ids))
            supplier.is_subcontractor = supplier.partner_id in boms.subcontractor_ids


class ProductProduct(models.Model):
    _inherit = 'product.product'

    def _prepare_sellers(self, params=False):
        if params and params.get('subcontractor_ids'):
            return super()._prepare_sellers(params=params).filtered(lambda s: s.partner_id in params.get('subcontractor_ids'))
        return super()._prepare_sellers(params=params)

    def _get_invalid_routes(self, route_ids):
        invalid_route_ids = super()._get_invalid_routes(route_ids)
        resupply_subcontractor_routes = self.env['stock.rule'].search([
            ('action', '=', 'pull'),
            ('picking_type_id.code', '=', 'internal'),
            ('location_src_id.is_subcontracting_location', '=', True),
            ('active', '=', True),
        ]).route_id
        has_subcontract_bom = any(bom_line.bom_id.type == 'subcontract' for bom_line in self.bom_line_ids)
        if not has_subcontract_bom and not any(route_id in self.route_ids for route_id in resupply_subcontractor_routes):
            invalid_route_ids += resupply_subcontractor_routes
        return invalid_route_ids
