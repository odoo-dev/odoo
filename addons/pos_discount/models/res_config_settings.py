# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models, api


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    _pos_discount__product_product_consumable_optional = models.Ref('pos_discount.product_product_consumable', 'product.product', required=False)

    # pos.config fields
    pos_discount_pc = fields.Float(related='pos_config_id.discount_pc', readonly=False)
    pos_discount_product_id = fields.Many2one('product.product', compute='_compute_pos_discount_product_id', store=True, readonly=False)

    @api.depends('company_id', 'pos_module_pos_discount', 'pos_config_id')
    def _compute_pos_discount_product_id(self):
        default_product = self._pos_discount__product_product_consumable_optional
        for res_config in self:
            discount_product = res_config.pos_config_id.discount_product_id or default_product
            if res_config.pos_module_pos_discount and (not discount_product.company_id or discount_product.company_id == res_config.company_id):
                res_config.pos_discount_product_id = discount_product
            else:
                res_config.pos_discount_product_id = False
