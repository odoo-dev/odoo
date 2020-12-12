# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class StockMoveLine(models.Model):
    _inherit = "stock.move.line"

    wave_id = fields.Many2one(
        'stock.picking.wave', string='Wave Transfer',
        check_company=True,
        states={'done': [('readonly', True)], 'cancel': [('readonly', True)]},
        help='Wave associated to this move line', copy=False)
    picking_type_id = fields.Many2one(related='move_id.picking_type_id')
    scheduled_date = fields.Datetime(related='move_id.date')

    @api.model
    def create(self, vals_list):
        res = super().create(vals_list)
        if vals_list.get('wave_id'):
            res.wave_id._sanity_check()
        return res

    def write(self, vals):
        res = super().write(vals)
        if vals.get('wave_id'):
            if not self.wave_id.picking_type_id:
                self.wave_id.picking_type_id = self.picking_type_id[0]
            self.wave_id._sanity_check()
        return res

    def action_open_wave(self):
        self.ensure_one()
        action = self.env["ir.actions.actions"]._for_xml_id("stock_picking_wave.stock_picking_wave_action")
        action.update({
            'views': [[False, 'form']],
            'res_id': self.wave_id.id,
        })
        return action

    def add_to_wave(self):
        wave = self.env.context.get('active_wave')
        if wave:
            wave = self.env['stock.picking.wave'].browse(wave)
            self.wave_id = wave
