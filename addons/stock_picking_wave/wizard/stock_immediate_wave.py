# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class StockImmediateWaveLine(models.TransientModel):
    _name = 'stock.immediate.wave.line'
    _description = 'Immediate Wave Line'

    immediate_wave_id = fields.Many2one('stock.immediate.wave', 'Immediate Wave', required=True)
    wave_id = fields.Many2one('stock.picking.wave', 'Wave', required=True)
    to_immediate = fields.Boolean('To Process')


class StockImmediateWave(models.TransientModel):
    _name = 'stock.immediate.wave'
    _description = 'Immediate Wave'

    wave_ids = fields.Many2many('stock.picking.wave', 'stock_wave_wave_rel')
    show_waves = fields.Boolean()
    immediate_wave_line_ids = fields.One2many(
        'stock.immediate.wave.line',
        'immediate_wave_id',
        string="Immediate Wave Lines")

    @api.model
    def default_get(self, fields_list):
        res = super().default_get(fields_list)
        if 'immediate_wave_line_ids' in fields_list and res.get('wave_ids'):
            res['immediate_wave_line_ids'] = [
                fields.Command.create({'to_immediate': True, 'wave_id': wave_id})
                for wave_id in res['wave_ids'][0][2]
            ]
        return res

    def process(self):
        waves_to_do = self.env['stock.picking.wave']
        waves_not_to_do = self.env['stock.picking.wave']
        for line in self.immediate_wave_line_ids:
            if line.to_immediate:
                waves_to_do |= line.wave_id
            else:
                waves_not_to_do |= line.wave_id

        for wave in waves_to_do:
            # If still in draft => confirm and assign
            for line in wave.move_line_ids.filtered(lambda m: m.state not in ['done', 'cancel']):
                line.qty_done = line.product_uom_qty

        waves_to_validate = self.env.context.get('button_validate_wave_ids')
        if waves_to_validate:
            waves_to_validate = self.env['stock.picking.wave'].browse(waves_to_validate)
            waves_to_validate = waves_to_validate - waves_not_to_do
            return waves_to_validate.with_context(skip_immediate=True).action_done()
        return True
