from odoo import fields, models


class Printers(models.Model):
    _name = 'printers.printer'
    _description = 'Printers'

    name = fields.Char(string='Name', required=True)
    company_id = fields.Many2one('res.company', required=True, default=lambda self: self.env.company)
    ip = fields.Char(string='IP')
    printer_type = fields.Selection([
        ('office_printer', 'Office Printer'),
        ('label_printer', 'Label Printer'),
    ], string='Type', default='office_printer')
    report_ids = fields.Many2many(
        'ir.actions.report',
        'report_printer_rel',
        'printer_id',
        'report_id',
        string='Reports',
    )
