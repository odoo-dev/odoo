# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models
from odoo.fields import Domain


class HrVersion(models.Model):
    _inherit = 'hr.version'

    def _get_leave_domain(self, start_dt, end_dt):
        # Exceptional-day records must never be treated as a leave (absence) nor as a
        # "worked leave" here: both would generate their own work entry on top of the
        # normal Attendance entry already produced from the injected working hours in
        # `resource.calendar._attendance_intervals_batch`, double-counting the day.
        domain = super()._get_leave_domain(start_dt, end_dt)
        return domain & Domain('is_exceptional_days', '=', False)
