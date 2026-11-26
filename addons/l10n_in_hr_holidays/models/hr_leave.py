# Part of Odoo. See LICENSE file for full copyright and licensing details.

from collections import defaultdict
from datetime import datetime, timedelta, time, UTC
from math import inf
from zoneinfo import ZoneInfo

from odoo import api, fields, models
from odoo.exceptions import ValidationError
from odoo.fields import Domain
from odoo.tools.date_utils import sum_intervals
from odoo.tools.intervals import Intervals
from odoo.tools.float_utils import float_compare


# Number of consecutive non-working days a sandwich span can extend over.
SANDWICH_MAX_DAYS = 30
INACTIVE_STATES = ('refuse', 'cancel')
ONE_DAY = timedelta(days=1)
SANDWICH_CLOSING_ORDER_SEQUENCE = 'l10n_in_hr_leave_sandwich_closing_order_seq'


class HrLeave(models.Model):
    _inherit = "hr.leave"

    l10n_in_contains_sandwich_leaves = fields.Boolean()
    # Order in which the leaves closed the sandwich gaps: set when the leave is created, and
    # again when a refused or cancelled leave is made active. A gap belongs to the leave that
    # closed it last (see ``_l10n_in_owns_sandwich_gap``). Not a field default: the existing
    # leaves keep 0 when the field is added, i.e. their creation order.
    l10n_in_sandwich_closing_order = fields.Integer(copy=False, readonly=True)

    def init(self):
        super().init()
        self.env.cr.execute(f"CREATE SEQUENCE IF NOT EXISTS {SANDWICH_CLOSING_ORDER_SEQUENCE}")

    @api.model_create_multi
    def create(self, vals_list):
        # Before the creation: the durations computed at creation already use it.
        for vals in vals_list:
            vals.setdefault('l10n_in_sandwich_closing_order', self._l10n_in_next_sandwich_closing_order())
        return super().create(vals_list)

    @api.model
    def _l10n_in_next_sandwich_closing_order(self):
        # A sequence: increasing, without conflict between concurrent transactions.
        self.env.cr.execute(f"SELECT nextval('{SANDWICH_CLOSING_ORDER_SEQUENCE}')")
        return self.env.cr.fetchone()[0]

    def write(self, vals):
        if vals.get('state') and vals['state'] not in INACTIVE_STATES:
            # Made active again: the leave closes its gaps again.
            for leave in self.filtered(lambda leave: leave.state in INACTIVE_STATES):
                leave.l10n_in_sandwich_closing_order = self._l10n_in_next_sandwich_closing_order()
        return super().write(vals)

    def _l10n_in_get_default_leave_hours(self):
        self.ensure_one()
        calendar = self.employee_id.resource_calendar_id
        start_dt = self._to_utc(self.request_date_from, 0.0, self.employee_id)
        end_dt = self._to_utc(self.request_date_to, 24.0, self.employee_id)
        work_data = self.employee_id._get_work_days_data_batch(
            start_dt,
            end_dt,
            compute_leaves=False,
            calendar=calendar,
        )
        data = work_data.get(self.employee_id.id)
        return data.get("hours", 0.0) if data else 0.0

    def _l10n_in_is_full_day_request(self, hours=None, default_hours=None):
        self.ensure_one()
        is_hour_request = self.work_entry_type_request_unit == 'hour'
        if not is_hour_request and (
            self.request_date_from_period != self.request_date_to_period
            and (self.request_date_from_period != "pm" or self.request_date_to_period != "am")
        ):
            # Whole days: no need to compute the hours of the schedule.
            return True
        default_hours = default_hours or self._l10n_in_get_default_leave_hours()
        if not default_hours:
            return not is_hour_request
        hours = hours if hours is not None else (self.number_of_hours or 0.0)
        return float_compare(hours, default_hours, precision_digits=2) >= 0

    @api.constrains("work_entry_type_id", "request_date_from", "request_date_to")
    def _l10n_in_check_optional_holiday_request_dates(self):
        leaves_to_check = self.filtered(lambda leave: leave.work_entry_type_id.l10n_in_is_limited_to_optional_days)
        if not leaves_to_check:
            return
        date_from = min(leaves_to_check.mapped("request_date_from"))
        date_to = max(leaves_to_check.mapped("request_date_to"))
        optional_holidays = dict(self.env["l10n.in.hr.leave.optional.holiday"]._read_group(
            domain=[("date", ">=", date_from), ("date", "<=", date_to)],
            groupby=["date:day"],
            aggregates=["__count"],
        ))
        optional_holidays_intervals = Intervals([(
                datetime.combine(date, time.min),
                datetime.combine(date, time.max),
                self.env['l10n.in.hr.leave.optional.holiday']
            )
            for date in optional_holidays
        ])
        invalid_leaves = []
        for leave in leaves_to_check:
            leave_intervals = Intervals([(
                    datetime.combine(leave.request_date_from, time.min),
                    datetime.combine(leave.request_date_to, time.max),
                    self.env['l10n.in.hr.leave.optional.holiday']
                )])
            common_intervals = leave_intervals & optional_holidays_intervals
            if round(sum_intervals(common_intervals), 2) != round(sum_intervals(leave_intervals), 2):
                invalid_leaves.append(leave.display_name)
        if invalid_leaves:
            raise ValidationError(
                self.env._("The following leaves are not on Optional Holidays:\n - %s", "\n - ".join(invalid_leaves))
            )

    @api.model
    def _l10n_in_search_sandwich_leaves(self, employees, date_from, date_to, domain=None):
        """ Return the sandwich leaves of ``employees`` that can affect the sandwich spans of
        ``[date_from, date_to]``.

        A span extends over at most ``SANDWICH_MAX_DAYS`` non-working days past its leave, and
        the links of the linked leaves are searched from their far edge: only the leaves close
        enough to the period are loaded, not the whole history of the employees. """
        margin = timedelta(days=SANDWICH_MAX_DAYS + 1)
        base_domain = Domain.AND([
            domain or [],
            [
                ('employee_id', 'in', employees.ids),
                ('work_entry_type_id.l10n_in_is_sandwich_leave', '=', True),
            ],
        ])
        search_from, search_to = date_from - 2 * margin, date_to + 2 * margin
        leaves = self.search(base_domain & Domain([
            ('request_date_to', '>=', search_from),
            ('request_date_from', '<=', search_to),
        ]))
        if leaves:
            # A leave found can be long: its own links are further away.
            widened_from = min(leaves.mapped('request_date_from')) - margin
            widened_to = max(leaves.mapped('request_date_to')) + margin
            if widened_from < search_from or widened_to > search_to:
                leaves = self.search(base_domain & Domain([
                    ('request_date_to', '>=', widened_from),
                    ('request_date_from', '<=', widened_to),
                ]))
        return leaves

    def _l10n_in_get_active_sandwich_leaves(self, include_self, hours_by_leave=None):
        """ Return the active, full day sandwich leaves that can sandwich non-working days with
        the leaves of ``self``.

        :param bool include_self: whether the active leaves of ``self`` are part of them (leaves
            created or approved together); otherwise, they are the ones of the employees as if
            the leaves of ``self`` did not exist (refused, deleted...)
        :param dict hours_by_leave: ``{leave id: hours}`` of the leaves of ``self``, when their
            ``number_of_hours`` is being computed
        """
        active_leaves = self._l10n_in_search_sandwich_leaves(
            self.employee_id,
            min(self.mapped('request_date_from')),
            max(self.mapped('request_date_to')),
            domain=[('id', 'not in', self.ids), ('state', 'not in', INACTIVE_STATES)],
        ).filtered(lambda leave: leave._l10n_in_is_full_day_request())
        if include_self:
            hours_by_leave = hours_by_leave or {}
            active_leaves |= self.filtered(
                lambda leave: leave.state not in INACTIVE_STATES
                and leave._l10n_in_is_full_day_request(hours=hours_by_leave.get(leave.id))
            )
        return active_leaves

    def _l10n_in_get_public_holiday_dates_by_employee(self, date_from, date_to):
        """ Return ``{employee: {local date: resource.calendar.leaves}}``: the public holidays of
        the employees of the leaves in ``self`` between ``date_from`` and ``date_to``.

        Like the requested dates of the leaves, the days are the ones of the employee's
        timezone. A public holiday restricted to a working schedule only applies on the days
        the employee follows that schedule. """
        employees = self.employee_id
        holidays = self.env['resource.calendar.leaves'].search([
            ('resource_id', '=', False),
            ('company_id', 'in', employees.company_id.ids),
            # One day of margin for the timezones
            ('date_from', '<=', datetime.combine(date_to + timedelta(days=1), time.max)),
            ('date_to', '>=', datetime.combine(date_from - timedelta(days=1), time.min)),
        ])
        holidays_by_company = holidays.grouped('company_id')
        public_holiday_dates_by_employee = {}
        for employee in employees:
            # The versions are not readable by every employee.
            sudo_employee = employee.sudo()
            tz = ZoneInfo(sudo_employee._get_tz())
            employee_dates = {}
            for holiday in holidays_by_company.get(employee.company_id, []):
                local_start = holiday.date_from.replace(tzinfo=UTC).astimezone(tz).date()
                local_end = holiday.date_to.replace(tzinfo=UTC).astimezone(tz).date()
                for offset in range((local_end - local_start).days + 1):
                    holiday_date = local_start + timedelta(days=offset)
                    if holiday.calendar_id and holiday.calendar_id != sudo_employee._get_version(holiday_date).resource_calendar_id:
                        continue
                    employee_dates[holiday_date] = holiday
            public_holiday_dates_by_employee[employee] = employee_dates
        return public_holiday_dates_by_employee

    def _l10n_in_get_sandwich_spans(self, active_leaves):
        """ Return ``{leave id: span}``: the days counted for each leave of ``self`` by the
        sandwich rules, given the ``active_leaves`` of the employees (see
        :meth:`_l10n_in_get_active_sandwich_leaves`). The leaves without working day have no span.

        The rules, on the days of the employee (weekends: the days off of the schedule in effect
        that day; public holidays: see :meth:`_l10n_in_get_public_holiday_dates_by_employee`):

        1. A leave counts the days from its first to its last working day, the non-working days
           in between included.
        2. Before its first working day (and after its last one), the run of non-working days up
           to the closest working day is a *gap*. When another active leave covers that working
           day and the gap is at most ``SANDWICH_MAX_DAYS`` days, the two leaves are *linked*:
           they sandwich the gap.
        3. A gap is counted on a single leave: the one that closed it last, i.e. created or made
           active again last (``l10n_in_sandwich_closing_order``, then the id). A leave being
           created, not saved yet, is the last one.
        4. A non-working day is only counted when the sandwich policy of the work entry type
           includes it: weekends, public holidays, or both.

        A span is a dict with:
            - ``counted_dates``: the days counted for the leave, ordered
            - ``sandwich_dates``: the non-working days among them
            - ``has_non_working``: whether there are non-working days between the first and the
              last day of the span, counted or not
            - ``linked_leaves``: the leaves linked to the leave, whichever counts the gap
        """
        spans = {}
        if not self:
            return spans
        margin = timedelta(days=SANDWICH_MAX_DAYS + 1)
        date_from = min(self.mapped('request_date_from')) - margin
        date_to = max(self.mapped('request_date_to')) + margin

        active_leave_by_employee_date = defaultdict(dict)
        for active_leave in active_leaves:
            for offset in range((active_leave.request_date_to - active_leave.request_date_from).days + 1):
                active_leave_by_employee_date[active_leave.employee_id][active_leave.request_date_from + timedelta(days=offset)] = active_leave

        public_holidays_by_employee = self._l10n_in_get_public_holiday_dates_by_employee(date_from, date_to)
        # The working schedule can change inside a span: the weekends are the days off of the
        # schedule in effect each day (the one of the leave before the first version).
        calendar_periods_by_employee = self.employee_id._get_calendar_periods(date_from, date_to, check_contract=False)
        weekend_dates_by_employee = {}
        for employee, employee_leaves in self.grouped('employee_id').items():
            weekend_dates = set()
            day = min(employee_leaves.mapped('request_date_from')) - margin
            last_day = max(employee_leaves.mapped('request_date_to')) + margin
            while day <= last_day:
                calendar = next(
                    (calendar for period_from, period_to, calendar in calendar_periods_by_employee.get(employee, [])
                     if period_from <= day <= period_to),
                    employee_leaves[0].resource_calendar_id,
                )
                if not calendar._works_on_date(day):
                    weekend_dates.add(day)
                day += ONE_DAY
            weekend_dates_by_employee[employee] = weekend_dates

        for leave in self:
            weekend_dates = weekend_dates_by_employee[leave.employee_id]
            # A work entry type including the public holidays in the duration works them.
            public_holiday_dates = {} if leave.work_entry_type_id.include_public_holidays_in_duration \
                else public_holidays_by_employee.get(leave.employee_id, {})
            active_leave_by_date = active_leave_by_employee_date[leave.employee_id]

            # Rule 1: from the first to the last working day of the leave.
            working_dates = [
                day for day in (leave.request_date_from + timedelta(days=offset)
                                for offset in range((leave.request_date_to - leave.request_date_from).days + 1))
                if day not in weekend_dates and day not in public_holiday_dates
            ]
            if not working_dates:
                continue
            span_start, span_end = working_dates[0], working_dates[-1]

            # Rules 2 and 3: the gaps before the first working day and after the last one.
            linked_leaves = self.env['hr.leave']
            for edge, step in ((span_start, -ONE_DAY), (span_end, ONE_DAY)):
                day = edge + step
                gap_days = 0
                while (day in weekend_dates or day in public_holiday_dates) and gap_days <= SANDWICH_MAX_DAYS:
                    day += step
                    gap_days += 1
                other_leave = active_leave_by_date.get(day)
                if gap_days > SANDWICH_MAX_DAYS or not other_leave or other_leave == leave:
                    continue
                linked_leaves |= other_leave
                leave_rank, other_rank = (
                    (rank_leave.l10n_in_sandwich_closing_order, rank_leave._origin.id) if rank_leave._origin.id else (inf, inf)
                    for rank_leave in (leave, other_leave)
                )
                if gap_days and leave_rank > other_rank:
                    if step == ONE_DAY:
                        span_end = day - ONE_DAY
                    else:
                        span_start = day + ONE_DAY

            # Rule 4: the non-working days counted by the sandwich policy.
            policy = leave.work_entry_type_id.l10n_in_sandwich_policy or 'full'
            counted_dates, sandwich_dates = [], set()
            has_non_working = False
            day = span_start
            while day <= span_end:
                is_weekend = day in weekend_dates
                is_public_holiday = day in public_holiday_dates
                if not is_weekend and not is_public_holiday:
                    counted_dates.append(day)
                else:
                    has_non_working = True
                    if (
                        policy == 'full'
                        or (policy == 'weekend' and is_weekend)
                        or (policy == 'public_holiday' and is_public_holiday)
                    ):
                        counted_dates.append(day)
                        sandwich_dates.add(day)
                day += ONE_DAY

            spans[leave.id] = {
                'counted_dates': counted_dates,
                'sandwich_dates': sandwich_dates,
                'has_non_working': has_non_working,
                'linked_leaves': linked_leaves,
            }
        return spans

    def _get_durations(self, check_work_entry_type=True, resource_calendar=None, additional_domain=None):
        result = super()._get_durations(check_work_entry_type=check_work_entry_type, resource_calendar=resource_calendar, additional_domain=additional_domain)

        indian_leaves = self.filtered(
            lambda leave: leave.company_id.country_id.code == "IN" and leave.work_entry_type_id.l10n_in_is_sandwich_leave
        )
        if not indian_leaves:
            return result
        hours_by_leave = {leave_id: hours for leave_id, (_days, hours) in result.items()}
        spans = indian_leaves._l10n_in_get_sandwich_spans(
            indian_leaves._l10n_in_get_active_sandwich_leaves(include_self=True, hours_by_leave=hours_by_leave)
        )
        for leave in indian_leaves:
            leave_days, hours = result[leave.id]
            if not leave_days or (
                leave.state in ["validate", "validate1"]
                and not self.env.user.has_group("hr_holidays.group_hr_holidays_user")
            ):
                continue
            span = spans.get(leave.id)
            if not span or not leave._l10n_in_is_full_day_request(hours=hours):
                leave.l10n_in_contains_sandwich_leaves = False
                continue
            span_days = len(span['counted_dates'])
            if span_days != leave_days:
                result[leave.id] = (span_days, span_days * hours / leave_days)
            leave.l10n_in_contains_sandwich_leaves = span['has_non_working']
        return result

    def _l10n_in_update_neighbors_duration_after_change(self, deleting=False):
        """ Recompute the durations of the leaves linked to the leaves of ``self`` after these
        changed (approved, refused, cancelled or deleted when ``deleting``), and of the leaves
        of ``self`` themselves when they are approved. """
        indian_leaves = self.filtered(
            lambda leave: leave.company_id.country_id.code == "IN" and leave.work_entry_type_id.l10n_in_is_sandwich_leave
        )
        if not indian_leaves:
            return
        if all(state in INACTIVE_STATES for state in self.mapped('state')):
            self.l10n_in_contains_sandwich_leaves = False

        active_leaves = indian_leaves._l10n_in_get_active_sandwich_leaves(include_self=not deleting)
        neighbors = self.env['hr.leave'].union(
            span['linked_leaves'] for span in indian_leaves._l10n_in_get_sandwich_spans(active_leaves).values()
        ) - self
        if any(state in ['validate', 'validate1'] for state in self.mapped('state')):
            neighbors |= self
        if not neighbors:
            return

        # The durations without the sandwich rules, then with them.
        base_durations = super(HrLeave, neighbors)._get_durations(check_work_entry_type=True, resource_calendar=None)
        spans = neighbors._l10n_in_get_sandwich_spans(active_leaves)
        for neighbor in neighbors:
            base_days, base_hours = base_durations.get(neighbor.id, (neighbor.number_of_days, neighbor.number_of_hours))
            span = spans.get(neighbor.id)
            if not span or not base_days or not neighbor._l10n_in_is_full_day_request(hours=base_hours):
                neighbor.write({
                    'number_of_days': base_days,
                    'number_of_hours': base_hours,
                    'l10n_in_contains_sandwich_leaves': False,
                })
                continue
            span_days = len(span['counted_dates'])
            neighbor.write({
                'number_of_days': span_days,
                'number_of_hours': span_days * base_hours / base_days,
                'l10n_in_contains_sandwich_leaves': span['has_non_working'],
            })

    @api.ondelete(at_uninstall=False)
    def _ondelete_refresh_neighbors(self):
        """Pre-delete hook: update neighbors as if these records were already deleted"""
        self._l10n_in_update_neighbors_duration_after_change(deleting=True)

    def action_refuse(self):
        res = super().action_refuse()
        self._l10n_in_update_neighbors_duration_after_change()
        return res

    def action_approve(self, check_state=True):
        res = super().action_approve(check_state)
        self._l10n_in_update_neighbors_duration_after_change()
        return res

    def _action_user_cancel(self, reason):
        res = super()._action_user_cancel(reason)
        self._l10n_in_update_neighbors_duration_after_change()
        return res

    def _get_max_allowed_absence_hours(self, base_max_hours):
        max_hours = super()._get_max_allowed_absence_hours(base_max_hours)
        if self.work_entry_type_id.l10n_in_is_sandwich_leave:
            return max(max_hours, self.number_of_hours)
        return max_hours
