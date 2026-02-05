# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class PosPrinter(models.Model):
    _inherit = 'pos.printer'

    printer_type = fields.Selection(
        selection_add=[('star_epos', 'Star Printer')],
        ondelete={'star_epos': 'set default'},
    )
    receipt_paper_width = fields.Selection(
        selection=[
            ('384', '2 Inch'),
            ('576', '3 Inch'),
            ('832', '4 Inch'),
        ],
        default='576',
    )

    @api.model
    def _load_pos_data_fields(self, config):
        return super(PosPrinter, self)._load_pos_data_fields(config) + ['receipt_paper_width']
