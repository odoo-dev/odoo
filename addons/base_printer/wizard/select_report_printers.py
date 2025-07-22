# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class SelectPrintersWizard(models.TransientModel):
    _name = 'select.report.printers.wizard'
    _description = "Selection of printers for report"

    printer_ids = fields.Many2many('report.printer', string="printrs")
