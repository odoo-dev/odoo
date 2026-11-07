from odoo import models


class IrActionsReport(models.Model):
    _inherit = 'ir.actions.report'

    _mrp_account__wip_report_optional = models.Ref('mrp_account.wip_report', required=False)
