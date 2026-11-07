# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, fields, models


class PickingLabelType(models.TransientModel):
    _inherit = 'picking.label.type'

    _stock__lot_label_layout_form_picking = models.Ref('stock.lot_label_layout_form_picking', 'ir.ui.view')

    production_ids = fields.Many2many('mrp.production')

    def process(self):
        if not self.production_ids:
            return super().process()
        if self.label_type == 'products':
            return self.production_ids.action_open_label_layout()
        return {
            'name': _('Choose Labels Layout'),
            'type': 'ir.actions.act_window',
            'res_model': 'lot.label.layout',
            'views': [(self._stock__lot_label_layout_form_picking.id, 'form')],
            'target': 'new',
            'context': {
                'default_move_line_ids': self.production_ids.move_finished_ids.move_line_ids.ids
            },
        }
