# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class StockMove(models.Model):
    _inherit = 'stock.move'

    repair_id = fields.Many2one('repair.order', 'move_id')
