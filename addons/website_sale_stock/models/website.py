# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class Website(models.Model):
    _inherit = ['website']

    warehouse_id = fields.Many2one('stock.warehouse', string='Warehouse')

    def _prepare_sale_order_values(self, partner_sudo):
        values = super()._prepare_sale_order_values(partner_sudo)

        warehouse_id = self._get_warehouse_available()
        if warehouse_id:
            values['warehouse_id'] = warehouse_id
        return values

    def _get_warehouse_available(self):
        return (
            self.warehouse_id.id or
            self.env['ir.default'].sudo()._get('sale.order', 'warehouse_id', company_id=self.company_id.id) or
            self.env['ir.default'].sudo()._get('sale.order', 'warehouse_id') or
            self.env['stock.warehouse'].sudo().search([('company_id', '=', self.company_id.id)], limit=1).id
        )

    def _get_product_available_qty(self, product, **kwargs):
        return product.with_context(warehouse_id=self._get_warehouse_available()).free_qty

    def _get_and_cache_current_order(self):
        if order_sudo := super()._get_and_cache_current_order():
            order_sudo = order_sudo.with_context(warehouse_id=order_sudo.warehouse_id.id)
        return order_sudo
