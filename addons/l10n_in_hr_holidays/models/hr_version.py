# Part of Odoo. See LICENSE file for full copyright and licensing details.

from collections import defaultdict
from datetime import UTC
from zoneinfo import ZoneInfo

from odoo import models


class HrVersion(models.Model):
    _inherit = 'hr.version'

    def _get_version_work_entries_values(self, date_start, date_stop):
        result = super()._get_version_work_entries_values(date_start, date_stop)
        in_versions = self.filtered(lambda version: version.company_id.country_id.code == 'IN')
        if not in_versions:
            return result

        start_dt = date_start.replace(tzinfo=UTC) if not date_start.tzinfo else date_start.astimezone(UTC)
        end_dt = date_stop.replace(tzinfo=UTC) if not date_stop.tzinfo else date_stop.astimezone(UTC)

        # The links (and their own links) used to compute the spans may lie outside the
        # generation window: only the leaves close enough to it to have an effect are loaded.
        leaves = self.env['hr.leave']._l10n_in_search_sandwich_leaves(
            in_versions.employee_id, start_dt.date(), end_dt.date(), domain=[('state', '=', 'validate')],
        )
        leaves = leaves.filtered(
            lambda leave: leave.company_id.country_id.code == 'IN' and leave._l10n_in_is_full_day_request()
        )
        if not leaves:
            return result

        spans = leaves._l10n_in_get_sandwich_spans(leaves)
        if not spans:
            return result
        leaves_per_employee_dict = leaves.grouped('employee_id')

        attendance_intervals_by_calendar = {
            calendar: calendar._attendance_intervals_batch(
                start_dt,
                end_dt,
                resources_per_tz=versions._get_resources_per_tz(),
            )
            for calendar, versions in in_versions.grouped('resource_calendar_id').items()
        }

        updatable_entries_by_version_date = defaultdict(lambda: defaultdict(list))
        occupied_dates_by_version = defaultdict(set)
        for work_entry_vals in result:
            version = work_entry_vals['version_id']
            if version not in in_versions:
                continue
            entry_date = work_entry_vals.get('date')
            if not entry_date and work_entry_vals.get('date_start'):
                entry_start = work_entry_vals['date_start']
                if not entry_start.tzinfo:
                    entry_start = entry_start.replace(tzinfo=UTC)
                entry_date = entry_start.astimezone(ZoneInfo(version._get_tz())).date()
            if not entry_date:
                continue

            occupied_dates_by_version[version].add(entry_date)
            if not work_entry_vals.get('leave_ids'):
                updatable_entries_by_version_date[version][entry_date].append(work_entry_vals)

        for version in in_versions:
            employee = version.employee_id
            tz = ZoneInfo(version._get_tz())
            start_date = start_dt.astimezone(tz).date()
            end_date = end_dt.astimezone(tz).date()
            attendance_intervals = attendance_intervals_by_calendar.get(version.resource_calendar_id, {}).get(employee.resource_id.id, [])
            attendance_dates = {interval[0].astimezone(tz).date() for interval in attendance_intervals}
            occupied_dates = occupied_dates_by_version[version]
            updatable_entries_by_date = updatable_entries_by_version_date[version]
            employee_leaves = leaves_per_employee_dict.get(employee, self.env['hr.leave'])
            sandwich_dates = {}

            for leave in employee_leaves.sorted('id'):
                span = spans.get(leave.id)
                if not span or not span['has_non_working']:
                    continue
                for span_date in span['counted_dates']:
                    if start_date <= span_date <= end_date:
                        # Overlapping spans: the leave created first wins.
                        sandwich_dates.setdefault(span_date, (leave, span_date in span['sandwich_dates']))

            for span_date, (leave, is_sandwich_date) in sandwich_dates.items():
                # The non-working days counted by the policy have their own type, so that
                # payroll pays them on their own line, as its rate says.
                work_entry_type = leave.work_entry_type_id
                if is_sandwich_date:
                    work_entry_type = work_entry_type.l10n_in_sandwich_work_entry_type_id or work_entry_type
                if updatable_entries := updatable_entries_by_date.pop(span_date, []):
                    for work_entry_vals in updatable_entries:
                        work_entry_vals.update({
                            'work_entry_type_id': work_entry_type,
                            'leave_ids': leave,
                        })
                    continue

                if span_date in attendance_dates or span_date in occupied_dates:
                    continue

                result.append({
                    'date': span_date,
                    'duration': version.resource_calendar_id.hours_per_day,
                    'work_entry_type_id': work_entry_type,
                    'employee_id': employee,
                    'company_id': version.company_id,
                    'version_id': version,
                    'leave_ids': leave,
                })
                occupied_dates.add(span_date)
        return result
