from odoo import models


class IrActionsClient(models.Model):
    _inherit = 'ir.actions.client'

    _account_reports__action_account_report_ap_optional = models.Ref('account_reports.action_account_report_ap', required=False)
    _account_reports__action_account_report_ar_optional = models.Ref('account_reports.action_account_report_ar', required=False)
    _account_reports__action_account_report_pl_optional = models.Ref('account_reports.action_account_report_pl', required=False)
