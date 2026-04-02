# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
import logging

from odoo import models, fields, api

_logger = logging.getLogger(__name__)


class PosOrder(models.Model):
    _inherit = "pos.order"

    table_stand_number = fields.Char(string="Table Stand Number")
    self_ordering_table_id = fields.Many2one('restaurant.table', string='Table reference', readonly=True)
    source = fields.Selection(selection_add=[
        ('mobile', 'Self-Order Mobile'),
        ('kiosk', 'Self-Order Kiosk')
    ])

    def write(self, vals):
        if 'table_id' in vals and self.self_ordering_table_id:
            # Clear stale self-order table link when the order is transferred to a new table.
            vals['self_ordering_table_id'] = vals['table_id']
        return super().write(vals)

    def _load_pos_self_data_fields(self, config):
        return super()._load_pos_self_data_fields(config) + ['table_id', 'course_ids', 'customer_count', 'table_stand_number', 'self_ordering_table_id', 'source']

    def _get_self_prefix(self, pos_config, device_type):
        if device_type in ['kiosk', 'mobile']:
            return f"K{pos_config.id}-" if device_type == "kiosk" else "S"
        return super()._get_self_prefix(pos_config, device_type)

    @api.model
    def _check_pos_order(self, pos_config, order, device_type, table=None):
        res = super()._check_pos_order(pos_config, order, device_type, table)
        floating_order_name = res['floating_order_name']
        if device_type == 'kiosk':
            floating_order_name = f"Table tracker {order['table_stand_number']}" if order.get('table_stand_number') else res['tracking_number']

        if not res['floating_order_name'] and table:
            floating_order_name = f"Self-Order T {table.table_number}"
        elif not res['floating_order_name']:
            floating_order_name = f"Self-Order {res['tracking_number']}"
        res['floating_order_name'] = floating_order_name
        res['self_ordering_table_id'] = table.id if table else False
        res['table_stand_number'] = order.get('table_stand_number')
        res['customer_count'] = order.get('customer_count')

        return res
