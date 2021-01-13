# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _
from odoo.exceptions import UserError
from collections import defaultdict
from pytz import utc

class ResourceCalendarLeaves(models.Model):
    _inherit = "resource.calendar.leaves"

    timesheet_ids = fields.One2many('account.analytic.line', 'global_leave_id', string="Analytic Lines")

    def _work_time_per_day(self):
        self.ensure_one()
        if not self.date_from.tzinfo:
            date_from = self.date_from.replace(tzinfo=utc)
        if not self.date_to.tzinfo:
            date_to = self.date_to.replace(tzinfo=utc)
        work_hours_intervals = self.calendar_id._attendance_intervals_batch(
            date_from,
            date_to)

        work_hours_data = work_hours_intervals[self.resource_id.id]
        result = defaultdict(float)
        for start, stop, dummy in work_hours_data:
            result[start.date()] += (stop - start).total_seconds() / 3600
        result = sorted(result.items())
        return result

    def _timesheet_create_lines(self):
        self.ensure_one()
        employees_ids = self.env['hr.employee'].search([('resource_calendar_id', '=', self.calendar_id.id)])
        vals_list = []

        work_hours_data = self._work_time_per_day()

        for employee in employees_ids:
            for index, (day_date, work_hours_count) in enumerate(work_hours_data): #add description to vals
                vals_list.append(self._timesheet_prepare_line_values(index, employee, work_hours_data, day_date, work_hours_count))
        timesheets = self.env['account.analytic.line'].sudo().create(vals_list)
        return timesheets

    def _timesheet_prepare_line_values(self, index, employee_id, work_hours_data, day_date, work_hours_count):
        self.ensure_one()
        return {
            'name': "%s (%s/%s)" % ('Global Time Off: ' + self.name if self.name else 'Global Time Off', index + 1, len(work_hours_data)),
            'project_id': employee_id.company_id.leave_timesheet_project_id.id,
            'task_id': employee_id.company_id.leave_timesheet_task_id.id,
            'account_id': employee_id.company_id.leave_timesheet_project_id.analytic_account_id.id,
            'unit_amount': work_hours_count,
            'user_id': employee_id.user_id.id,
            'date': day_date,
            'global_leave_id': self.id,
            'employee_id': employee_id.id,
            'company_id': employee_id.company_id.id,
        }

    @api.model
    def create(self, vals):
        result = super(ResourceCalendarLeaves, self).create(vals)
        company = result.calendar_id.company_id or self.env.company
        if result.resource_id.id is False and company.leave_timesheet_project_id and company.leave_timesheet_task_id:
            result._timesheet_create_lines()
        return result

    def modify_dates(self):
        timesheets = self.sudo().mapped('timesheet_ids')
        timesheets.write({'global_leave_id': False})
        timesheets.unlink()
        self._timesheet_create_lines()

    def write(self, vals):
        timesheets = self.sudo().mapped('timesheet_ids')
        if any(timesheet.validated for timesheet in timesheets):
            raise UserError(_("""You cannot modify this global time off,
                             as it is linked to timesheets that are already validated.
                             Please remove the corresponding timesheets first."""))
        super(ResourceCalendarLeaves, self).write(vals)
        timesheets = self.sudo().mapped('timesheet_ids')
        if 'name' in vals:
            for timesheet in timesheets:
                timesheet.write({'name': 'Global Time Off: ' + self.name if self.name else 'Global Time Off'})
        if vals.get('date_from') or vals.get('date_to'):
            self.modify_dates()
        return

    def unlink(self):
        """ Remove the timesheets linked to a deleted global time off """
        timesheets = self.sudo().mapped('timesheet_ids')
        timesheets.write({'global_leave_id': False})
        timesheets.unlink()
        return super(ResourceCalendarLeaves, self).unlink()
