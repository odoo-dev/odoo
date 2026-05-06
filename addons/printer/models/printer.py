from odoo import models, fields


class Printer(models.Model):
    _name = "printer.printer"
    _description = "External Printer"

    name = fields.Char(required=True)
    ip_address = fields.Char(string="IP Address")
    report_ids = fields.Many2many("ir.actions.report", string="Linked Reports")
    company_id = fields.Many2one('res.company', required=True, default=lambda self: self.env.company)
    type = fields.Selection([
            ('zpl', "ZPL"),
            ('epos', "ePOS"),
            ('pdf', "PDF"),
        ],
        default="zpl",
        required=True,
        string="Type",
        help=(
            "Choose how this printer is used:\n"
            "- ZPL: Only for Zebra label printers.\n"
            "- ePOS: For Epson label printers.\n"
            "- PDF: For pdf report/document printing."
        ),
    )
    use_lna = fields.Boolean(string="Use Local Network Access")
