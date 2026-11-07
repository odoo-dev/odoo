from odoo import models


class PortalEntry(models.Model):
    _inherit = 'portal.entry'

    _hr_timesheet__portal_timesheets = models.Ref('hr_timesheet.portal_timesheets', required=False)
