# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models, _

class StockWarnMissingVendor(models.TransientModel):
    _name = "stock.warn.missing.vendor"
    _description = 'Warn missing vendor on product'

    product_id = fields.Many2one('product.product', 'Product')

    def action_edit_product(self):
        view = self.env.ref('product.product_normal_form_view')
        return {
            'name': _('Product'),
            'type': 'ir.actions.act_window',
            'res_model': 'product.product',
            'views': [(view.id, 'form')],
            'target': 'current',
            'res_id': self.product_id.id
        }
