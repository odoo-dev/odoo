from odoo import fields, models


class ReportPrinter(models.Model):
    _name = "report.printer"
    _description = "Report printer"
    _check_company_auto = True

    name = fields.Char(string="Printer name")
    printer_mode = fields.Selection(selection=[('email', 'Email Address'), ('ip', 'IP Address(Label Printer)')], string="Type of Printer", default="email")
    printer_email = fields.Char(string="Printer Eamil Address")
    printer_ip = fields.Char(string="Printer IP Address")
    company_id = fields.Many2one("res.company", string="Company", default=lambda self: self.env.company)
    report_id = fields.Many2one("ir.actions.report", string="Associated Report")
