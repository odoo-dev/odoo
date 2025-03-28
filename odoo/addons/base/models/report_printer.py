# -*- coding: ascii -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class ReportPrinter(models.Model):
    _name = "report.printer"
    _description = "Report printer"

    name = fields.Char(string="Printer name")
    printer_type = fields.Selection(selection=[('email', 'Email Address'), ('ip', 'IP Address')], string="Type of Printer", default="email")
    printer_email = fields.Char(string="Printer Eamil Address")
    printer_ip = fields.Char(string="Printer IP Address")
    company_id = fields.Many2one("res.company", string="Company", default=lambda self: self.env.company)
    report_id = fields.Many2one("ir.actions.report", string="Associated Report")  

