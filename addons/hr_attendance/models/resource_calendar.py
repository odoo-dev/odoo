from odoo import models


class ResourceCalendar(models.Model):
    _inherit = 'resource.calendar'

    _hr_attendance__resource_calendar_std_38h = models.Ref('hr_attendance.resource_calendar_std_38h', required=False)
