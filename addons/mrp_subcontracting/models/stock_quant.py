# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models, _
from odoo.exceptions import UserError


class StockQuant(models.Model):
    _inherit = 'stock.quant'

    is_subcontract = fields.Boolean(store=False, search='_search_is_subcontract')

    def _search_is_subcontract(self, operator, value):
        if operator not in ['=', '!='] or not isinstance(value, bool):
            raise UserError(_('Operation not supported'))

        return [('location_id.is_subcontracting_location', operator, value)]

    # def _get_quants_by_products_locations(self, product_ids, location_ids, extra_domain=False):
    #     if not extra_domain:
    #         extra_domain = []
    #     extra_domain.append(('location_id.is_subcontracting_location', '=', False))
    #     return super()._get_quants_by_products_locations(product_ids, location_ids, extra_domain=extra_domain)
