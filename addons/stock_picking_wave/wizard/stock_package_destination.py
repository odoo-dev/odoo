# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class ChooseDestinationLocation(models.TransientModel):
    _inherit = "stock.package.destination"

    wave_id = fields.Many2one('stock.picking.wave')

    def _compute_move_line_ids(self):
        destination_without_wave = self.env['stock.package.destination']
        for destination in self:
            if destination.wave_id:
                destination.move_line_ids = destination.wave_id.move_line_ids.filtered(lambda l: l.qty_done > 0 and not l.result_package_id)
            else:
                destination_without_wave |= destination
        super(ChooseDestinationLocation, destination_without_wave)._compute_move_line_ids()

    def action_done(self):
        if self.wave_id:
            self.wave_id.move_line_ids.location_dest_id = self.location_dest_id
            return self.wave_id.action_put_in_pack()
        return super().action_done()
