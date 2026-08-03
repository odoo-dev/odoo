# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime, time, timedelta

from odoo import models
from odoo.tools.intervals import Intervals


class ResourceCalendar(models.Model):
    _inherit = 'resource.calendar'

    def _l10n_in_get_exceptional_days(self, date_from, date_to, company=None):
        company = company or self.company_id or self.env.company
        domain = self.env['resource.calendar.leaves']._l10n_in_get_exceptional_days_domain(
            date_from, date_to, company=company, calendar=self if self else None,
        )
        return self.env['resource.calendar.leaves'].sudo().search(domain)

    def _works_on_date(self, date):
        if super()._works_on_date(date):
            return True
        return bool(self._l10n_in_get_exceptional_days(date, date))

    def _leave_intervals_batch(self, start_dt, end_dt, resources_per_tz=None, domain=None):
        # `resource.calendar.leaves._leave_intervals_batch` only applies its own
        # default `count_as='absence'` filter when no domain is given at all: any
        # caller-supplied domain (e.g. `_get_unusual_days`'s company filter) bypasses
        # that check entirely, which would let an exceptional-day record (itself a
        # `resource.calendar.leaves` row) be treated as a leave again and cancel out
        # the working hours injected below. So exclude it unconditionally here instead
        # of relying on `count_as` alone.
        if domain is None:
            domain = [('count_as', '=', 'absence')]
        domain = domain + [('is_exceptional_days', '=', False)]
        return super()._leave_intervals_batch(start_dt, end_dt, resources_per_tz=resources_per_tz, domain=domain)

    def _attendance_intervals_batch(self, start_dt, end_dt, resources_per_tz=None, domain=None):
        result = super()._attendance_intervals_batch(start_dt, end_dt, resources_per_tz=resources_per_tz, domain=domain)
        # Only extend the simple single-calendar case: a `domain` means this call is
        # narrowing attendance lines for a specific purpose (e.g. leave-type filtering)
        # and shouldn't be augmented with exceptional-day hours.
        if not self or domain:
            return result
        self.ensure_one()

        exceptional_days = self._l10n_in_get_exceptional_days(start_dt.date(), end_dt.date())
        if not exceptional_days:
            return result

        hours_per_day = self.hours_per_day or 8.0
        half_day = timedelta(hours=hours_per_day / 2)
        resources_per_tz = resources_per_tz or {start_dt.tzinfo: self.env['resource.resource']}

        for tz, resources in resources_per_tz.items():
            for resource in list(resources) + [self.env['resource.resource']]:
                company = resource.company_id if resource else self.company_id
                resource_exceptional_days = exceptional_days.filtered(
                    lambda leave, company=company: leave.company_id.id in (company.id, False)
                )
                if not resource_exceptional_days:
                    continue

                existing = result.get(resource.id, Intervals([]))
                existing_dates = {iv[0].astimezone(tz).date() for iv in existing}

                new_intervals = []
                for leave in resource_exceptional_days:
                    day = max(leave.working_start_date, start_dt.astimezone(tz).date())
                    last_day = min(leave.working_end_date, end_dt.astimezone(tz).date())
                    while day <= last_day:
                        if day not in existing_dates:
                            midpoint = datetime.combine(day, time(12, 0), tzinfo=tz)
                            day_start = max(start_dt.astimezone(tz), midpoint - half_day)
                            day_end = min(end_dt.astimezone(tz), midpoint + half_day)
                            if day_start < day_end:
                                dummy_attendance = self.env['resource.calendar.attendance'].new({
                                    'duration_hours': hours_per_day,
                                })
                                new_intervals.append((day_start, day_end, dummy_attendance))
                        day += timedelta(days=1)

                if new_intervals:
                    result[resource.id] = existing | Intervals(new_intervals, keep_distinct=True)

        return result