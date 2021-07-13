# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class ResCompany(models.Model):
    _inherit = 'res.company'

    def write(self, vals):
        res = super().write(vals)
        if 'hr_attendance_overtime' not in vals:
            return res
        extra_hours_time_off_type = self.env.ref('hr_holidays_attendance.holiday_status_extra_hours', raise_if_not_found=False)
        if not extra_hours_time_off_type:
            return res
        all_companies = self.env['res.company'].sudo().search([])
        # Unarchive time of type if the feature is enabled
        if any(company.hr_attendance_overtime and not extra_hours_time_off_type.active for company in all_companies):
            extra_hours_time_off_type.toggle_active()
        # Archive time of type if the feature is disabled for all the company
        if all(not company.hr_attendance_overtime and extra_hours_time_off_type.active for company in all_companies):
            extra_hours_time_off_type.toggle_active()
        return res
