# Part of Odoo. See LICENSE file for full copyright and licensing details.

import re

from odoo import api, fields, models, _
from odoo.exceptions import ValidationError


class ReportPrinter(models.Model):
    _name = "report.printer"
    _description = "Report printer"
    _check_company_auto = True

    name = fields.Char(string="Printer Address", help="Enter email address of the printer to send print jobs directly to the configured printer.", required=True)
    company_id = fields.Many2one("res.company", string="Company", default=lambda self: self.env.company, readonly=True)

    @api.constrains("name")
    def is_valid_printer_adrress(self):
        email_pattern = r"[^@]+@[^@]+\.[^@]+"
        for record in self:
            if not re.match(email_pattern, record.name):
                raise ValidationError(_(
                    "Printer address must be a valid email address.\n"
                    "Example: printer@example.com"
                ))
