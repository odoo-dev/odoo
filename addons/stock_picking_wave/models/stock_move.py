# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models
from odoo.fields import Command


class StockMove(models.Model):
    _inherit = "stock.move"

    def _split(self, qty, restrict_partner_id=None, waves=None):
        res = super()._split(qty, restrict_partner_id)
        if not res:
            return res
        if not waves:
            waves = self.env['stock.picking.wave']
        lines_on_wave = self.move_line_ids.filtered(lambda ml: ml.wave_id in waves)
        if lines_on_wave:
            res[0]['move_line_ids'] = [Command.set((self.move_line_ids - lines_on_wave).ids)]
        return res
