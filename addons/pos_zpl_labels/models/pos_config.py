# -*- coding: utf-8 -*-
from odoo import fields, models

class PosConfig(models.Model):
    _inherit = 'pos.config'

    zpl_printer_id = fields.Many2one(
        'pos.printer', string="ZPL Printer",
        domain="[('paper_size', '=', 'label')]",
        help="Printer used to print ZPL labels for products."
    )
