from odoo import models


class IrActionsReport(models.Model):
    _inherit = 'ir.actions.report'

    _hr__action_report_employee_cv = models.Ref('hr.action_report_employee_cv', 'ir.actions.report', required=False)
