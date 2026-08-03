# Part of Odoo. See LICENSE file for full copyright and licensing details.

from dateutil.relativedelta import relativedelta
from datetime import datetime, time, timedelta

from odoo import api, models


class HrEmployees(models.Model):
    _inherit = 'hr.employee'

    @api.model
    def get_special_days_data(self, date_start, date_end):
        res = super().get_special_days_data(date_start, date_end)
        return dict(
            res,
            optionalHolidays=self._get_optional_holidays_data(date_start, date_end),
            exceptionalDays=self._get_exceptional_days_data(date_start, date_end),
        )

    def _get_optional_holidays_data(self, date_start, date_end):
        optional_holidays = self.env['l10n.in.hr.leave.optional.holiday'].search([
            ('date', '<=', date_end),
            ('date', '>=', date_start),
            ('company_id', 'in', self.env.companies.ids)
        ])
        return [{
            'id': -optional_holiday.id,
            'title': optional_holiday.name,
            'isAllDay': True,
            'start': optional_holiday.date.isoformat(),
            'startType': "date",
            'end': optional_holiday.date.isoformat(),
            'endType': "date",
        } for optional_holiday in optional_holidays]

    def _get_exceptional_days(self, date_start, date_end):
        self = self._get_contextual_employee()
        domain = [
            ('is_exceptional_days', '=', True),
            ('working_start_date', '<=', date_end),
            ('working_end_date', '>=', date_start),
            ('company_id', 'in', (self.company_id or self.env.company).ids),
        ]
        if self:
            domain += ['|', ('calendar_id', '=', False), ('calendar_id', '=', self.resource_calendar_id.id)]
        return self.env['resource.calendar.leaves'].search(domain)

    def _get_exceptional_days_data(self, date_start, date_end):
        return [{
            'id': -exceptional_day.id,
            'title': exceptional_day.name,
            'isAllDay': True,
            'start': exceptional_day.working_start_date.isoformat(),
            'startType': "date",
            'end': exceptional_day.working_end_date.isoformat(),
            'endType': "date",
        } for exceptional_day in self._get_exceptional_days(date_start, date_end)]

    @api.model
    def get_exceptional_days(self, employee_id, date_start, date_end):
        employee = self.browse(employee_id) if employee_id else self.env['hr.employee']
        all_days = {}
        for exceptional_day in employee._get_exceptional_days(date_start, date_end):
            num_days = (exceptional_day.working_end_date - exceptional_day.working_start_date).days
            for d in range(num_days + 1):
                all_days[str(exceptional_day.working_start_date + relativedelta(days=d))] = True
        return all_days

    def _get_public_holidays(self, date_start, date_end):
        return super()._get_public_holidays(date_start, date_end).filtered(
            lambda leave: not leave.is_exceptional_days
        )

    def _get_hours_for_date(self, target_date, day_period=None, count_non_working_days=False):
        # On an exceptional day, the calendar has no real attendance record for that
        # date (e.g. a Saturday), so the base method has nothing to compute an hour
        # range from and collapses to (0.0, 0.0) - a zero-width "working day", which
        # silently makes any leave requested on it compute to 0 days/hours. Route it
        # through the same "count non-working days as full working days" branch the
        # base method already has, so it gets a normal hours_per_day range like any
        # other working day.
        if self and not count_non_working_days:
            version = self._get_version(target_date)
            calendar = version.resource_calendar_id
            if calendar and calendar._l10n_in_get_exceptional_days(target_date, target_date, company=self.company_id):
                count_non_working_days = True
        return super()._get_hours_for_date(target_date, day_period=day_period, count_non_working_days=count_non_working_days)

    def _get_unusual_days(self, date_from, date_to=None):
        unusual_days = super()._get_unusual_days(date_from, date_to)

        if self.company_id.country_id.code != "IN":
            return unusual_days

        date_from_date = datetime.strptime(
            date_from, "%Y-%m-%d %H:%M:%S"
        ).date()

        date_to_date = (
            datetime.strptime(date_to, "%Y-%m-%d %H:%M:%S").date()
            if date_to
            else date_from_date
        )

        exceptional_days = self.env["resource.calendar.leaves"].search([
            ("resource_id", "=", False),
            ("holiday_id", "=", False),
            ("is_exceptional_days", "=", True),
            "|",
                "&",
                    ("date_from", "<=", date_to_date),
                    ("date_to", ">=", date_from_date),
                "&",
                    ("working_start_date", "<=", date_to_date),
                    ("working_end_date", ">=", date_from_date),
        ])

        if not exceptional_days:
            return unusual_days

        working_dates = set()
        compensatory_dates = set()

        for holiday in exceptional_days:

            # Exceptional working dates
            if holiday.date_from and holiday.date_to:
                start = holiday.date_from.date()
                end = holiday.date_to.date()

                while start <= end:
                    working_dates.add(start.isoformat())
                    start += timedelta(days=1)

            # Compensatory holiday dates (Date fields)
            if holiday.working_start_date and holiday.working_end_date:
                start = holiday.working_start_date
                end = holiday.working_end_date

                while start <= end:
                    compensatory_dates.add(start.isoformat())
                    start += timedelta(days=1)

        for day in unusual_days:
            if day in working_dates:
                unusual_days[day] = False
            elif day in compensatory_dates:
                unusual_days[day] = True

        return unusual_days
