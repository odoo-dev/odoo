# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class HrEmployeePublic(models.Model):
    _inherit = 'hr.employee.public'

    # These are required for manual attendance
    attendance_state = fields.Selection(related='employee_id.attendance_state', related_sudo=True, readonly=True,
        groups="hr_attendance.group_hr_attendance_own,hr_attendance.group_hr_attendance_officer")
    hours_today = fields.Float(related='employee_id.hours_today', related_sudo=True, readonly=True,
        groups="hr_attendance.group_hr_attendance_own,hr_attendance.group_hr_attendance_officer")
    hours_last_month = fields.Float(related='employee_id.hours_last_month', related_sudo=True)
    hours_last_month_overtime = fields.Float(related='employee_id.hours_last_month_overtime', related_sudo=True)
    last_attendance_id = fields.Many2one(related='employee_id.last_attendance_id', related_sudo=True, readonly=True,
        groups="hr_attendance.group_hr_attendance_own,hr_attendance.group_hr_attendance_officer")
    total_overtime = fields.Float(related='employee_id.total_overtime', related_sudo=True, readonly=True)
    attendance_manager_id = fields.Many2one(related='employee_id.attendance_manager_id', related_sudo=True,
        groups="hr_attendance.group_hr_attendance_own,hr_attendance.group_hr_attendance_officer")
    last_check_in = fields.Datetime(related='employee_id.last_check_in', related_sudo=True,
        groups="hr_attendance.group_hr_attendance_own,hr_attendance.group_hr_attendance_officer")
    last_check_out = fields.Datetime(related='employee_id.last_check_out', related_sudo=True,
        groups="hr_attendance.group_hr_attendance_own,hr_attendance.group_hr_attendance_officer")
    display_extra_hours = fields.Boolean(related='company_id.hr_attendance_display_overtime', related_sudo=True)
    display_attendances = fields.Boolean(related='employee_id.display_attendances', related_sudo=True)

    def action_open_last_month_attendances(self):
        self.ensure_one()
        if self.display_attendances:
            return self.employee_id.action_open_last_month_attendances()
