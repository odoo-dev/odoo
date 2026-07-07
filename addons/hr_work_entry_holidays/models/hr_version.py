# Part of Odoo. See LICENSE file for full copyright and licensing details.

import pytz
from collections import defaultdict
from datetime import datetime, timedelta, time

from odoo import api, models
from odoo.fields import Domain


class HrVersion(models.Model):
    _inherit = 'hr.version'
    _description = 'Employee Contract'

    # override to add work_entry_type from leave
    def _get_leave_work_entry_type(self, leave):
        if leave.holiday_id:
            return leave.holiday_id.holiday_status_id.work_entry_type_id
        else:
            return leave.work_entry_type_id

    def _get_more_vals_leave_interval(self, interval, leaves):
        result = super()._get_more_vals_leave_interval(interval, leaves)
        for leave in leaves:
            if interval[0] >= leave[0] and interval[1] <= leave[1]:
                if leave[2].holiday_id.id:
                    result.append(('leave_id', leave[2].holiday_id.id))
                    break
        return result

    def _get_interval_leave_work_entry_type(self, interval, leaves, bypassing_codes):
        # returns the work entry time related to the leave that
        # includes the whole interval.
        # Overriden in hr_work_entry_holiday to select the
        # global time off first (eg: Public Holiday > Home Working)
        self.ensure_one()
        if 'work_entry_type_id' in interval[2]:
            work_entry_types = interval[2].work_entry_type_id
            if work_entry_types and work_entry_types[:1].code in bypassing_codes:
                return work_entry_types[:1]

        interval_start = interval[0].astimezone(pytz.utc).replace(tzinfo=None)
        interval_stop = interval[1].astimezone(pytz.utc).replace(tzinfo=None)
        including_rcleaves = [l[2] for l in leaves if l[2] and interval_start >= l[2].date_from and interval_stop <= l[2].date_to]
        including_global_rcleaves = [l for l in including_rcleaves if not l.holiday_id]
        including_holiday_rcleaves = [l for l in including_rcleaves if l.holiday_id]
        rc_leave = False

        # Example: In CP200: Long term sick > Public Holidays (which is global)
        if bypassing_codes:
            bypassing_rc_leave = [l for l in including_holiday_rcleaves if l.holiday_id.holiday_status_id.work_entry_type_id.code in bypassing_codes]
        else:
            bypassing_rc_leave = []

        if bypassing_rc_leave:
            rc_leave = bypassing_rc_leave[0]
        elif including_global_rcleaves:
            rc_leave = including_global_rcleaves[0]
        elif including_holiday_rcleaves:
            rc_leave = including_holiday_rcleaves[0]
        if rc_leave:
            return self._get_leave_work_entry_type_dates(rc_leave, interval_start, interval_stop, self.employee_id)
        return self.env.ref('hr_work_entry.work_entry_type_leave')

    def _get_sub_leave_domain(self):
        # see https://github.com/odoo/enterprise/pull/15091
        return super()._get_sub_leave_domain() | Domain('holiday_id.employee_id', 'in', self.employee_id.ids)

    @api.model
    def _generate_work_entries_postprocess_adapt_to_calendar(self, vals):
        res = super()._generate_work_entries_postprocess_adapt_to_calendar(vals)
        return res or (not 'work_entry_type_id' not in vals and vals.get('leave_id'))

    def _get_version_work_entries_values(self, date_start, date_stop):
        result = super()._get_version_work_entries_values(date_start, date_stop)

        duration_based_versions = self.filtered(
            lambda v: v.resource_calendar_id.duration_based
        )
        if not duration_based_versions:
            return result

        start_dt = pytz.utc.localize(date_start) if not date_start.tzinfo else date_start
        end_dt = pytz.utc.localize(date_stop) if not date_stop.tzinfo else date_stop
        bypassing_work_entry_type_codes = self._get_bypassing_work_entry_type_codes()

        # Fetch only hour-based validated leaves for duration based employees
        all_leaves = self.env['hr.leave'].search([
            ('employee_id', 'in', duration_based_versions.employee_id.ids),
            ('state', '=', 'validate'),
            ('request_unit_hours', '=', True),
            ('date_from', '<=', end_dt.astimezone(pytz.utc).replace(tzinfo=None)),
            ('date_to', '>=', start_dt.astimezone(pytz.utc).replace(tzinfo=None)),
        ])

        if not all_leaves:
            return result

        leaves_per_employee = defaultdict(lambda: self.env['hr.leave'])
        for leave in all_leaves:
            leaves_per_employee[leave.employee_id] |= leave

        # Index existing work entries by employee and date to remove overlapping attendance entries
        existing_by_employee_date = defaultdict(lambda: defaultdict(list))
        for idx, vals in enumerate(result):
            date = vals['date_start'].date()
            existing_by_employee_date[vals['employee_id']][date].append(idx)

        indices_to_remove = set()
        new_entries = []

        for version in duration_based_versions:
            employee = version.employee_id
            calendar = version.resource_calendar_id
            tz = pytz.timezone(calendar.tz)

            max_hours_per_day = calendar.hours_per_day
            if not max_hours_per_day:
                continue

            for leave in leaves_per_employee[employee]:
                leave_work_entry_type = version._get_interval_leave_work_entry_type(
                    (
                        leave.date_from.astimezone(tz),
                        leave.date_to.astimezone(tz),
                        leave.resource_calendar_id,
                    ),
                    [],
                    bypassing_work_entry_type_codes,
                )

                leave_start = max(start_dt, leave.date_from.astimezone(tz))
                leave_end = min(end_dt, leave.date_to.astimezone(tz))

                current_day = leave_start.date()
                while current_day <= leave_end.date():
                    # For duration based: use full day boundaries
                    # Employee can work anytime during the day
                    day_start = tz.localize(datetime.combine(current_day, time.min))
                    day_end = tz.localize(datetime.combine(current_day, time.max))

                    # Clamp leave to current day
                    leave_interval_start = max(leave_start, day_start)
                    leave_interval_end = min(leave_end, day_end)

                    if leave_interval_start >= leave_interval_end:
                        current_day += timedelta(days=1)
                        continue

                    leave_hours = min(
                        (leave_interval_end - leave_interval_start).total_seconds() / 3600,
                        max_hours_per_day,
                    )
                    remaining_work_hours = max(0, max_hours_per_day - leave_hours)

                    # Center the full working day (leave + attendance) around 12:00 PM
                    total_day_start = tz.localize(datetime.combine(current_day, time(12, 0))) - timedelta(hours=max_hours_per_day / 2)

                    # Leave starts at the beginning of the centered window
                    # preserving its duration but repositioned to center around noon
                    centered_leave_start = total_day_start
                    centered_leave_end = centered_leave_start + timedelta(hours=leave_hours)

                    # Attendance immediately follows the leave
                    centered_attendance_start = centered_leave_end
                    centered_attendance_end = centered_attendance_start + timedelta(hours=remaining_work_hours)

                    # Mark existing attendance work entries for this day for removal
                    for idx in existing_by_employee_date[employee.id][current_day]:
                        entry = result[idx]
                        indices_to_remove.add(idx)

                    # Leave work entry for the taken hours
                    new_entries.append(dict([
                        ('name', '%s%s' % (
                            leave_work_entry_type.name + ': ' if leave_work_entry_type else '',
                            employee.name,
                        )),
                        ('date_start', centered_leave_start.astimezone(pytz.utc).replace(tzinfo=None)),
                        ('date_stop', centered_leave_end.astimezone(pytz.utc).replace(tzinfo=None)),
                        ('work_entry_type_id', leave_work_entry_type.id),
                        ('employee_id', employee.id),
                        ('company_id', version.company_id.id),
                        ('version_id', version.id),
                        ('state', 'draft'),
                        ('leave_id', leave.id)
                    ]))

                    # Attendance work entry for remaining hours after the leave
                    if remaining_work_hours > 0:
                        attendance_start = centered_leave_end
                        attendance_end = attendance_start + timedelta(hours=remaining_work_hours)

                        # Cap attendance within same day
                        day_hard_end = tz.localize(datetime.combine(current_day, time(23, 59, 59)))
                        if attendance_end > day_hard_end:
                            attendance_end = day_hard_end
                            remaining_work_hours = (attendance_end - attendance_start).total_seconds() / 3600

                        if remaining_work_hours > 0:
                            new_entries.append(dict([
                                ('name', employee.name),
                                ('date_start', attendance_start.astimezone(pytz.utc).replace(tzinfo=None)),
                                ('date_stop', attendance_end.astimezone(pytz.utc).replace(tzinfo=None)),
                                ('work_entry_type_id', self.env.ref('hr_work_entry.work_entry_type_attendance').id),
                                ('employee_id', employee.id),
                                ('company_id', version.company_id.id),
                                ('version_id', version.id),
                                ('state', 'draft'),
                            ]))

                    current_day += timedelta(days=1)

        # Rebuild result excluding replaced attendance entries and append new split entries
        result = [v for idx, v in enumerate(result) if idx not in indices_to_remove]
        result += new_entries

        return result
