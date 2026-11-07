from odoo import api, models


class AccountAnalyticLine(models.Model):
    _inherit = 'account.analytic.line'

    _hr_timesheet__portal_timesheets = models.Ref('hr_timesheet.portal_timesheets', 'portal.entry', required=False)

    @api.model
    def _show_portal_timesheets(self):
        """
        Determine if we show timesheet information in the portal.
        """
        return bool(self._hr_timesheet__portal_timesheets and self._hr_timesheet__portal_timesheets.show_in_portal)
