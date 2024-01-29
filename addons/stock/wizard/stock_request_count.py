# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models
from odoo.osv import expression


class StockRequestCount(models.TransientModel):
    _name = 'stock.request.count'
    _description = 'Stock Request an Inventory Count'

    inventory_date = fields.Date(
        'Inventory Date', required=True,
        help="Choose a date to get the inventory at that date",
        default=fields.Datetime.now)
    user_id = fields.Many2one('res.users', string="User")
    quant_ids = fields.Many2many('stock.quant')
    set_count = fields.Selection([('empty', 'Leave Empty'), ('set', 'Set Current Value')], default='empty', string='Count')

    def action_request_count(self):
        for count_request in self:
            quants_to_count = count_request._get_quants_to_count()
            if count_request.set_count == 'set':
                quants_to_count.filtered(lambda q: not q.inventory_quantity_set).action_set_inventory_quantity()
            values = count_request._get_values_to_write()
            quants_to_count.with_context(inventory_mode=True).write(values)

    def _get_quants_to_count(self):
        self.ensure_one()
        quants_to_count = self.quant_ids
        if not self.env.user.has_group('stock.group_production_lot'):
            return quants_to_count
        domain = []
        # Searches sibling quants for tracked product.
        for quant in self.quant_ids:
            if quant.product_id.tracking == 'none':
                continue
            quant_domain = ['&',
                            ('product_id', '=', quant.product_id.id),
                            ('location_id', '=', quant.location_id.id)]
            domain = expression.OR([domain, quant_domain]) if domain else quant_domain
        if domain:
            sibling_quants = self.env['stock.quant'].search(domain)
            quants_to_count |= sibling_quants
        return quants_to_count

    def _get_values_to_write(self):
        values = {
            'inventory_date': self.inventory_date,
        }
        if self.user_id:
            values['user_id'] = self.user_id.id,
        return values
