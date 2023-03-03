# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import timedelta, datetime, time
from collections import defaultdict

from odoo import api, fields, models
from odoo.tools import split_every


class ResPartner(models.Model):
    _inherit = 'res.partner'

    purchase_line_ids = fields.One2many('purchase.order.line', 'partner_id', string="Purchase Lines")
    on_time_rate = fields.Float(
        "On-Time Delivery Rate", compute='_compute_on_time_rate',
        help="Over the past 12 months; the number of products received on time divided by the number of ordered products.")

    @api.depends('purchase_line_ids')
    def _compute_on_time_rate(self):
        order_line_ids = self.env['purchase.order.line']._search([
            ('partner_id', 'in', self.ids),
            ('date_order', '>', fields.Date.today() - timedelta(365)),
            ('qty_received', '!=', 0),
            ('order_id.state', 'in', ['done', 'purchase'])])

        lines_qty_done = defaultdict(lambda: 0)
        partner_dict = {}

        for order_lines in split_every(1000, order_line_ids, self.env['purchase.order.line'].browse):
            order_lines = order_lines.filtered(lambda l: l.product_id.sudo().product_tmpl_id.type != 'service')
            moves = self.env['stock.move'].search([
                ('purchase_line_id', 'in', order_lines.ids),
                ('state', '=', 'done')]).filtered(lambda m: m.date.date() <= m.purchase_line_id.date_planned.date())
            for move, qty_done in zip(moves, moves.mapped('quantity_done')):
                lines_qty_done[move.purchase_line_id.id] += qty_done
            for line in order_lines:
                on_time, ordered = partner_dict.get(line.partner_id, (0, 0))
                ordered += line.product_uom_qty
                on_time += lines_qty_done[line.id]
                partner_dict[line.partner_id] = (on_time, ordered)

            order_lines.invalidate_cache()
            moves.invalidate_cache()

        seen_partner = self.env['res.partner']
        for partner, numbers in partner_dict.items():
            seen_partner |= partner
            on_time, ordered = numbers
            partner.on_time_rate = on_time / ordered * 100 if ordered else -1   # use negative number to indicate no data
        (self - seen_partner).on_time_rate = -1
