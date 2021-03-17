# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class StockRequestCount(models.TransientModel):
    _name = 'stock.request.count'
    _description = 'Stock Request an Inventory Count'

    inventory_date = fields.Date(
        'Inventory Date', required=True,
        help="Choose a date to get the inventory at that date",
        default=fields.Datetime.now)
    user_id = fields.Many2one(
        'res.users', string="User", required=True)
    quant_ids = fields.Many2many('stock.quant')

    def action_request_count(self):
        for count_request in self:
            count_request.quant_ids.with_context(inventory_mode=True).write(
                count_request._get_values_to_write())

    def _get_values_to_write(self):
        return {
            'inventory_date': self.inventory_date,
            'user_id': self.user_id,
        }
