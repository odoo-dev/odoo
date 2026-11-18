from odoo import api, models


class PosReport(models.Model):
    _name = 'pos.report'
    _inherit = ['pos.report', 'printer.report.mixin']

    _printer_report_action = 'printer_pos.action_report_pos_report'
