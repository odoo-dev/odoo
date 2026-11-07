from odoo import models


class IrAccess(models.Model):
    _inherit = 'ir.access'

    _project__account_analytic_line_rule_manager = models.Ref('project.account_analytic_line_rule_manager', 'ir.access', required=False)
