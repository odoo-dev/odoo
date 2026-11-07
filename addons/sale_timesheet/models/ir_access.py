from odoo import models


class IrAccess(models.Model):
    _inherit = 'ir.access'

    _account__account_analytic_line_rule_billing_user = models.Ref('account.account_analytic_line_rule_billing_user', 'ir.access', required=False)
    _account__account_analytic_line_rule_readonly_user = models.Ref('account.account_analytic_line_rule_readonly_user', 'ir.access', required=False)
