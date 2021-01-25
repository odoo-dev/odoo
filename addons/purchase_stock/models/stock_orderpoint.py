# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, _


class StockWarehouseOrderpoint(models.Model):
    _inherit = 'stock.warehouse.orderpoint'

    def action_replenish(self):
        if self.route_id == self.env.ref('purchase_stock.route_warehouse0_buy'):
            supplier = self.product_id.with_company(self.company_id.id)._select_seller(
                        quantity=self.product_min_qty,
                        uom_id=self.product_uom)
            supplier = supplier or self.product_id._prepare_sellers(False).filtered(
                    lambda s: not s.company_id or s.company_id == self.company_id
                )[:1]

            if not supplier and self.env['product.product'].check_access_rights('write'):
                view = self.env.ref('purchase_stock.stock_warn_missing_vendor_form_view')
                return {
                    'name': _('Missing vendor on Product'),
                    'type': 'ir.actions.act_window',
                    'res_model': 'stock.warn.missing.vendor',
                    'views': [(view.id, 'form')],
                    'target': 'new',
                    'context': {
                        'default_product_id': self.product_id.id,
                        'form_view_initial_mode': 'edit'
                        },
                }
        return super().action_replenish()
