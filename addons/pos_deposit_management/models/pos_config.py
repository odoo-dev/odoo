# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _
from odoo.exceptions import UserError


class PosConfig(models.Model):
    _inherit = 'pos.config'

    deposit_product_id = fields.Many2one('product.product', string='Deposit Product',
        domain=[('sale_ok', '=', True)], help='The product used to take the deposit on the product.')

    @api.model
    def _default_deposit_product_on_module_install(self):
        configs = self.env['pos.config'].search([])
        product = self.env.ref("pos_deposit_management.product_product_consumable", raise_if_not_found=False)
        for conf in configs:
            conf.deposit_product_id = product if conf.module_pos_deposit_management and product and (not product.company_id or product.company_id == conf.company_id) else False

    def open_ui(self):
        for config in self:
            if not self.current_session_id and config.module_pos_deposit_management and not config.deposit_product_id:
                raise UserError(_('A deposit product is needed to use the Deposit Management feature. Go to Point of Sale > Configuration > Settings to set it.'))
        return super().open_ui()

    def _get_special_products(self):
        res = super()._get_special_products()
        default_deposit_product = self.env.ref('pos_deposit_management.product_product_consumable', raise_if_not_found=False) or self.env['product.product']
        return res | self.env['pos.config'].search([]).mapped('deposit_product_id') | default_deposit_product
