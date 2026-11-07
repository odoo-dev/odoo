from odoo import api, models


class AccountAnalyticLine(models.Model):
    _inherit = 'account.analytic.line'

    @api.model
    def _show_portal_timesheets(self):
        """
        Determine if we show timesheet information in the portal.
        """
        return bool(self.env['portal.entry']._hr_timesheet__portal_timesheets and self.env['portal.entry']._hr_timesheet__portal_timesheets.show_in_portal)
