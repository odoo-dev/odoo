# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from collections import defaultdict
from pytz import timezone, utc

from odoo import api, fields, models, _


class ResourceCalendarLeaves(models.Model):
    _inherit = "resource.calendar.leaves"

    timesheet_ids = fields.One2many('account.analytic.line', 'global_leave_id', string="Analytic Lines")

    def _work_time_per_day(self):
        """ Get work time per day based on the calendar and its attendances

            1) Gets all calendars with their characteristics (i.e.
                (a) the leaves in it,
                (b) the resources which have a leave,
                (c) the oldest and
                (d) the latest leave dates
               ) for leaves in self.
            2) Search the attendances based on the characteristics retrieved for each calendar.
                The attendances found are the ones between the date_from of the oldest leave
                and the date_to of the most recent leave.
            3) Create a dict as result of this method containing:
                {
                    leave: {
                            max(date_start of work hours, date_start of the leave):
                                the duration in days of the work including the leave
                    }
                }
        """
        leaves_read_group = self.env['resource.calendar.leaves']._read_group(
            [('id', 'in', self.ids)],
            ['calendar_ids', 'ids:array_agg(id)', 'resource_ids:array_agg(resource_id)', 'min_date_from:min(date_from)', 'max_date_to:max(date_to)'],
            ['calendar_ids'],
        )
        # dict of keys: calendar_id
        #   and values : { 'date_from': datetime, 'date_to': datetime, resources: self.env['resource.resource'] }
        cal_attendance_intervals_dict = {
            res['calendar_ids'][0]: {
                'date_from': utc.localize(res['min_date_from']),
                'date_to': utc.localize(res['max_date_to']),
                'resources': self.env['resource.resource'].browse(res['resource_ids'] if res['resource_ids'] and res['resource_ids'][0] else []),
                'leaves': self.env['resource.calendar.leaves'].browse(res['ids']),
            } for res in leaves_read_group
        }
        # to easily find the calendar with its id.
        calendars_dict = {calendar.id: calendar for calendar in self.calendar_ids}

        # dict of keys: leave.id
        #   and values: a dict of keys: date
        #                   and values: number of days
        results = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))
        for calendar_id, cal_attendance_intervals_params_entry in cal_attendance_intervals_dict.items():
            calendar = calendars_dict[calendar_id]
            work_hours_intervals = calendar._attendance_intervals_batch(
                cal_attendance_intervals_params_entry['date_from'],
                cal_attendance_intervals_params_entry['date_to'],
                cal_attendance_intervals_params_entry['resources'],
                tz=timezone(calendar.tz)
            )
            for leave in cal_attendance_intervals_params_entry['leaves']:
                work_hours_data = work_hours_intervals[leave.resource_id.id]

                for date_from, date_to, dummy in work_hours_data:
                    if date_to > utc.localize(leave.date_from) and date_from < utc.localize(leave.date_to):
                        tmp_start = max(date_from, utc.localize(leave.date_from))
                        tmp_end = min(date_to, utc.localize(leave.date_to))
                        results[leave.id][calendar_id][tmp_start.date()] += (tmp_end - tmp_start).total_seconds() / 3600
        for leave in results.keys():
            for calendar in results[leave].keys():
                results[leave][calendar] = sorted(results[leave][calendar].items())
        return results

    def _timesheet_create_lines(self):
        """ Create timesheet leaves for each employee using the same calendar containing in self.calendar_id

            If the employee has already a time off in the same day then no timesheet should be created.
        """
        work_hours_data = self._work_time_per_day()
        employees_groups = self.env['hr.employee']._read_group(
            [('resource_calendar_id', 'in', self.calendar_ids.ids)],
            ['resource_calendar_id', 'ids:array_agg(id)'],
            ['resource_calendar_id'])
        mapped_employee = {
            employee['resource_calendar_id'][0]: self.env['hr.employee'].browse(employee['ids'])
            for employee in employees_groups
        }
        employee_ids_set = set()
        employee_ids_set.update(*[line['ids'] for line in employees_groups])
        min_date = max_date = None
        for leaves in work_hours_data.values():
            for calendar in leaves.values():
                for d, dummy in calendar:
                    if not min_date and not max_date:
                        min_date = max_date = d
                    elif d < min_date:
                        min_date = d
                    elif d > max_date:
                        max_date = d

        holidays_read_group = self.env['hr.leave']._read_group([
            ('employee_id', 'in', list(employee_ids_set)),
            ('date_from', '<=', max_date),
            ('date_to', '>=', min_date),
            ('state', 'not in', ('cancel', 'refuse')),
        ], ['date_from_list:array_agg(date_from)', 'date_to_list:array_agg(date_to)', 'employee_id'], ['employee_id'])
        holidays_by_employee = {
            line['employee_id'][0]: [
                (date_from.date(), date_to.date()) for date_from, date_to in zip(line['date_from_list'], line['date_to_list'])
            ] for line in holidays_read_group
        }
        vals_list = []
        for leave in self:
            for calendar_id in leave.calendar_ids.ids:
                for employee in mapped_employee.get(calendar_id, self.env['hr.employee']):
                    holidays = holidays_by_employee.get(employee.id)
                    work_hours_list = work_hours_data[leave.id][calendar_id]
                    for index, (day_date, work_hours_count) in enumerate(work_hours_list):
                        if not holidays or all(not (date_from <= day_date and date_to >= day_date) for date_from, date_to in holidays):
                            vals_list.append(
                                leave._timesheet_prepare_line_values(
                                    index,
                                    employee,
                                    work_hours_list,
                                    day_date,
                                    work_hours_count
                                )
                            )
        return self.env['account.analytic.line'].sudo().create(vals_list)

    def _timesheet_prepare_line_values(self, index, employee_id, work_hours_data, day_date, work_hours_count):
        self.ensure_one()
        return {
            'name': _("Time Off (%s/%s)", index + 1, len(work_hours_data)),
            'project_id': employee_id.company_id.internal_project_id.id,
            'task_id': employee_id.company_id.leave_timesheet_task_id.id,
            'account_id': employee_id.company_id.internal_project_id.analytic_account_id.id,
            'unit_amount': work_hours_count,
            'user_id': employee_id.user_id.id,
            'date': day_date,
            'global_leave_id': self.id,
            'employee_id': employee_id.id,
            'company_id': employee_id.company_id.id,
        }

    @api.model_create_multi
    def create(self, vals_list):
        results = super(ResourceCalendarLeaves, self).create(vals_list)
        results_with_leave_timesheet = results.filtered(lambda r: not r.resource_id.id and r.calendar_ids.company_id.internal_project_id and r.calendar_ids.company_id.leave_timesheet_task_id)
        results_with_leave_timesheet and results_with_leave_timesheet._timesheet_create_lines()
        return results

    def write(self, vals):
        start_dates = self.mapped('date_from')
        end_dates = self.mapped('date_to')
        result = super(ResourceCalendarLeaves, self).write(vals)
        date_from, date_to = vals.get('date_from'), vals.get('date_to')
        if date_from or date_to:
            if any(start_date != date_from or end_date != date_to for start_date, end_date in zip(start_dates, end_dates)):
                timesheets = self.mapped('timesheet_ids')
                if timesheets:
                    timesheets.write({'global_leave_id': False})
                    timesheets.unlink()
                    self._timesheet_create_lines()
        return result
