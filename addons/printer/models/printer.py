# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields, api
from odoo.exceptions import ValidationError


class Printer(models.Model):
    _name = "printer.printer"
    _description = "External Printer"

    name = fields.Char(required=True)
    ip_address = fields.Char(string="IP Address")
    report_ids = fields.Many2many("ir.actions.report", string="Linked Reports")
    company_id = fields.Many2one('res.company', required=True, default=lambda self: self.env.company)
    printer_type = fields.Selection([
            ('label_printer', "Label Printer"),
            ('office_printer', "Office Printer"),
        ],
        string="Printer Type",
        default='label_printer',
        help=(
            "Select the printer type to control formatting and printing behavior:\n"
            "- Label Printer: For printing label using ZPL/EPOS"
            "- Office Printer: For standard documents such as PDF reports.\n"
        ),
    )
    type = fields.Selection([
            ("zpl", "ZPL"),
            ('epos', 'ePOS'),
            ("pdf", "PDF"),
        ],
        default="zpl", required=True, string="Type",
    )

    def _get_allowed_types(self):
        self.ensure_one()

        if self.printer_type == 'label_printer':
            return ['zpl', 'epos']

        if self.printer_type == 'receipt_printer':
            return ['epos']

        if self.printer_type == 'office_printer':
            return ['pdf']

        return []

    @api.constrains('printer_type', 'type')
    def _check_type_validity(self):
        for rec in self:
            allowed = rec._get_allowed_types()
            if rec.type not in allowed:
                raise ValidationError(
                    f"Invalid configuration:\n\n"
                    f"Printer Type: {rec.printer_type}\n"
                    f"Allowed Types: {', '.join(allowed)}\n",
                )
