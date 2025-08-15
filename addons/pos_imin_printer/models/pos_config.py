# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    enable_imin_printer = fields.Boolean(
        string='iMin Printer',
        help='Enable iMin Printer for this POS configuration.',
        default=False,
    )
