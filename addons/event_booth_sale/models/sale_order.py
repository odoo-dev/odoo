# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _, Command


class SaleOrder(models.Model):
    _inherit = 'sale.order'

    event_booth_ids = fields.One2many('event.booth', 'sale_order_id', string='Booths')
    event_booth_count = fields.Integer(string='Booth Count', compute='_compute_event_booth_count')

    @api.depends('event_booth_ids')
    def _compute_event_booth_count(self):
        slot_data = self.env['event.booth']._read_group(
            [('sale_order_id', 'in', self.ids)],
            ['sale_order_id'], ['__count'],
        )
        slot_mapped = {sale_order.id: count for sale_order, count in slot_data}
        for so in self:
            so.event_booth_count = slot_mapped.get(so.id, 0)

    def action_confirm(self):
        res = super(SaleOrder, self).action_confirm()
        for so in self:
            so.order_line._update_event_booths()
        return res

    def action_view_booth_list(self):
        action = self.env['ir.actions.act_window']._for_xml_id('event_booth.event_booth_action')
        action['domain'] = [('sale_order_id', 'in', self.ids)]
        return action

    def copy_data(self, default=None):
        if default is None:
            default = {}
        order_lines = []
        for line in self.order_line:
            line_values = line.copy_data()[0]
            if line.product_template_id.detailed_type == 'event_booth':
                line_values.update({'name':_('Event Booth')})
            order_lines.append(
                Command.create(line_values)
            )
        default.update({'order_line': order_lines})
        return super(SaleOrder, self).copy_data(default)
