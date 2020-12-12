# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models, api, _
from odoo.exceptions import UserError


class StockPickingToWave(models.TransientModel):
    _name = 'stock.picking.to.wave'
    _description = 'Wave Transfer Lines'

    wave_id = fields.Many2one('stock.picking.wave', string='Wave Transfer', domain="[('state', '!=', 'done')]")
    mode = fields.Selection([('existing', 'an existing wave transfer'), ('new', 'a new wave transfer')], default='existing')
    user_id = fields.Many2one('res.users', string='Responsible', help='Person responsible for this wave transfer')

    @api.model
    def default_get(self, fields_list):
        pickings = self.env['stock.picking'].browse(self.env.context.get('active_ids'))
        if len(pickings.picking_type_id) > 1:
            raise UserError(_("The selected transfers should belong to the same operation type"))
        return super().default_get(fields_list)

    def attach_pickings(self):
        self.ensure_one()
        pickings = self.env['stock.picking'].browse(self.env.context.get('active_ids'))
        if self.mode == 'new':
            company = pickings.company_id
            if len(company) > 1:
                raise UserError(_("The selected transfers should belong to a unique company."))
            wave = self.env['stock.picking.wave'].create({
                'user_id': self.user_id.id,
                'company_id': company.id,
                'picking_type_id': pickings[0].picking_type_id.id,
            })
        else:
            wave = self.wave_id

        view = self.env.ref('stock_picking_wave.view_stock_move_operations_to_wave')
        return {
            'name': _('Add Operations'),
            'type': 'ir.actions.act_window',
            'view_mode': 'list',
            'view': view,
            'views': [(view.id, 'tree')],
            'res_model': 'stock.move.line',
            'target': 'new',
            'domain': [
                ('picking_id', 'in', pickings.ids),
                ('state', '!=', 'done')
            ],
            'context': dict(
                self.env.context,
                picking_to_wave=pickings.ids,
                active_wave=wave.id,
                search_default_by_location=True,
            )}


class StockMoveLineToWave(models.TransientModel):
    _name = 'stock.move.line.to.wave'
    _description = 'Wave Transfer Lines'

    wave_id = fields.Many2one('stock.picking.wave', string='Wave Transfer')
    line_ids = fields.Many2many('stock.move.line')

    @api.model
    def default_get(self, fields_list):
        res = super().default_get(fields_list)
        picking_ids = self.env.context.get('picking_to_wave')
        wave_id = self.env.context.get('active_wave')
        if wave_id:
            wave = self.env['stock.picking.wave'].browse(wave_id)
        if picking_ids:
            pickings = self.env['stock.picking'].browse(picking_ids)
        if 'wave_id' in fields_list:
            res['wave_id'] = wave.id
        if 'line_ids' in fields_list:
            res['line_ids'] = pickings.move_line_ids.ids
        return res

    def attach_lines(self):
        self.ensure_one()
        self.wave_id.move_line_ids += self.line_ids
