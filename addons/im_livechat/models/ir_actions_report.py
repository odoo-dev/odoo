from odoo import models


class IrActionsReport(models.Model):
    _inherit = 'ir.actions.report'

    _im_livechat__action_report_livechat_conversation = models.Ref('im_livechat.action_report_livechat_conversation', 'ir.actions.report', required=False)
