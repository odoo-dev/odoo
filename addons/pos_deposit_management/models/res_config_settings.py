# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    pos_deposit_product_id = fields.Many2one('product.product', compute='_compute_pos_deposit_product_id', store=True, readonly=False)

    @api.depends('company_id', 'pos_module_pos_deposit_management', 'pos_config_id')
    def _compute_pos_deposit_product_id(self):
        default_product = self.env.ref("pos_deposit_management.product_product_consumable", raise_if_not_found=False) or self.env['product.product']
        for res_config in self:
            deposit_product = res_config.pos_config_id.deposit_product_id or default_product
            if res_config.pos_module_pos_deposit_management and (not deposit_product.company_id or deposit_product.company_id == res_config.company_id):
                res_config.pos_deposit_product_id = deposit_product
            else:
                res_config.pos_deposit_product_id = False
