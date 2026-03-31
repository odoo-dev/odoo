from odoo import fields, models


class Printers(models.Model):
    _name = 'printers.printer'
    _description = 'Printers'

    name = fields.Char(string='Name', required=True)
    ip = fields.Char(string='IP')
    printer_type = fields.Selection([
        ('office_printer', 'Office Printer'),
        # add label printer type
    ], string='Type', default='office_printer')
    report_ids = fields.Many2many(
        'ir.actions.report',
        'report_printer_rel',
        'printer_id',
        'report_id',
        string='Reports',
    )
