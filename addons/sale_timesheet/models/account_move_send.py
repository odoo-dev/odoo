from odoo import models


class AccountMoveSend(models.AbstractModel):
    _inherit = 'account.move.send'

    _sale_timesheet__timesheet_report_account_move = models.Ref('sale_timesheet.timesheet_report_account_move', 'ir.actions.report')

    def _get_placeholder_mail_template_dynamic_attachments_data(self, move, mail_template, pdf_report=None):
        """Override to filter timesheet reports based on invoice content."""
        placeholders = super()._get_placeholder_mail_template_dynamic_attachments_data(
            move, mail_template
        )
        return [
            p for p in placeholders
            if p.get('dynamic_report') != self._sale_timesheet__timesheet_report_account_move.report_name
            or move.timesheet_ids
        ]
