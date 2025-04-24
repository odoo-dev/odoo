# Part of Odoo. See LICENSE file for full copyright and licensing details.

import pytz

from calendar import monthrange
from collections import defaultdict
from datetime import datetime, timedelta, date, time
from dateutil.relativedelta import relativedelta
from operator import itemgetter
from pytz import timezone, UTC
from random import randint

from odoo.http import request
from odoo import models, fields, api, exceptions, _
from odoo.osv.expression import AND, OR
from odoo.tools.float_utils import float_is_zero
from odoo.exceptions import AccessError
from odoo.tools import convert, format_duration, format_time, format_datetime
from odoo.tools.date_intervals import Intervals
from odoo.tools.float_utils import float_compare

def get_google_maps_url(latitude, longitude):
    return "https://maps.google.com?q=%s,%s" % (latitude, longitude)


class HrAttendance(models.Model):
    _name = 'hr.attendance'
    _description = "Attendance"
    _order = "check_in desc"
    _inherit = ["mail.thread"]

    def _default_employee(self):
        if self.env.user.has_group('hr_attendance.group_hr_attendance_manager'):
            return self.env.user.employee_id

    employee_id = fields.Many2one('hr.employee', string="Employee", default=_default_employee, required=True,
        ondelete='cascade', index=True, group_expand='_read_group_employee_id')
    department_id = fields.Many2one('hr.department', string="Department", related="employee_id.department_id",
        readonly=True)
    manager_id = fields.Many2one(comodel_name='hr.employee', related="employee_id.parent_id", readonly=True,
        export_string_translation=False)
    attendance_manager_id = fields.Many2one('res.users', related="employee_id.attendance_manager_id",
        export_string_translation=False)
    is_manager = fields.Boolean(compute="_compute_is_manager")
    check_in = fields.Datetime(string="Check In", default=fields.Datetime.now, required=True, tracking=True, index=True)
    check_out = fields.Datetime(string="Check Out", tracking=True)
    worked_hours = fields.Float(string='Worked Hours', compute='_compute_worked_hours', store=True, readonly=True)
    color = fields.Integer(compute='_compute_color')

    in_latitude = fields.Float(string="Latitude", digits=(10, 7), readonly=True, aggregator=None)
    in_longitude = fields.Float(string="Longitude", digits=(10, 7), readonly=True, aggregator=None)
    in_country_name = fields.Char(string="Country", help="Based on IP Address", readonly=True)
    in_city = fields.Char(string="City", readonly=True)
    in_ip_address = fields.Char(string="IP Address", readonly=True)
    in_browser = fields.Char(string="Browser", readonly=True)
    in_mode = fields.Selection(string="Mode",
                               selection=[('kiosk', "Kiosk"),
                                          ('systray', "Systray"),
                                          ('manual', "Manual"),
                                          ('technical', 'Technical')],
                               readonly=True,
                               default='manual')
    out_latitude = fields.Float(digits=(10, 7), readonly=True, aggregator=None)
    out_longitude = fields.Float(digits=(10, 7), readonly=True, aggregator=None)
    out_country_name = fields.Char(help="Based on IP Address", readonly=True)
    out_city = fields.Char(readonly=True)
    out_ip_address = fields.Char(readonly=True)
    out_browser = fields.Char(readonly=True)
    out_mode = fields.Selection(selection=[('kiosk', "Kiosk"),
                                           ('systray', "Systray"),
                                           ('manual', "Manual"),
                                           ('technical', 'Technical'),
                                           ('auto_check_out', 'Automatic Check-Out')],
                                readonly=True,
                                default='manual')

    analysis_line_ids = fields.One2many(
        'hr.attendance.analysis.line',
        'attendance_id',
        string="Attendance Analysis Lines",
        readonly=True,
        help="Detailed breakdown of worked time based on attendance rules."
    )

    def _compute_color(self):
        for attendance in self:
            if attendance.check_out:
                attendance.color = 1 if attendance.worked_hours > 16 or attendance.out_mode == 'technical' else 0
            else:
                attendance.color = 1 if attendance.check_in < (datetime.today() - timedelta(days=1)) else 10

    @api.depends('employee_id', 'check_in', 'check_out')
    def _compute_display_name(self):
        tz = request.httprequest.cookies.get('tz') if request else None
        for attendance in self:
            if not attendance.check_out:
                attendance.display_name = _(
                    "From %s",
                    format_time(self.env, attendance.check_in, time_format=None, tz=tz, lang_code=self.env.lang),
                )
            else:
                attendance.display_name = _(
                    "%(worked_hours)s (%(check_in)s-%(check_out)s)",
                    worked_hours=format_duration(attendance.worked_hours),
                    check_in=format_time(self.env, attendance.check_in, time_format=None, tz=tz, lang_code=self.env.lang),
                    check_out=format_time(self.env, attendance.check_out, time_format=None, tz=tz, lang_code=self.env.lang),
                )

    @api.depends('employee_id')
    def _compute_is_manager(self):
        have_manager_right = self.env.user.has_group('hr_attendance.group_hr_attendance_manager')
        have_officer_right = self.env.user.has_group('hr_attendance.group_hr_attendance_officer')
        for attendance in self:
            attendance.is_manager = have_manager_right or \
                (have_officer_right and attendance.attendance_manager_id.id == self.env.user.id)

    def _get_employee_calendar(self):
        self.ensure_one()
        return self.employee_id.resource_calendar_id or self.employee_id.company_id.resource_calendar_id

    def _get_employee_holidays(self, employee, start_date, end_date):
        """
        Placeholder: Fetches public holidays for a given employee within a date range.
        Replace with your actual implementation, possibly using hr.leave.
        Should return a set of dates.
        """
        return set() # Return empty set for now


    @api.depends('check_in', 'check_out')
    def _compute_worked_hours(self):
        """ Computes the worked hours of the attendance record.
            The worked hours of resource with flexible calendar is computed as the difference
            between check_in and check_out, without taking into account the lunch_interval"""
        for attendance in self:
            if attendance.check_out and attendance.check_in and attendance.employee_id:
                calendar = attendance._get_employee_calendar()
                resource = attendance.employee_id.resource_id
                tz = timezone(resource.tz) if not calendar else timezone(calendar.tz)
                check_in_tz = attendance.check_in.astimezone(tz)
                check_out_tz = attendance.check_out.astimezone(tz)
                lunch_intervals = []
                if not attendance.employee_id.is_flexible:
                    lunch_intervals = attendance.employee_id._employee_attendance_intervals(check_in_tz, check_out_tz, lunch=True)
                attendance_intervals = Intervals([(check_in_tz, check_out_tz, attendance)]) - lunch_intervals
                delta = sum((i[1] - i[0]).total_seconds() for i in attendance_intervals)
                attendance.worked_hours = delta / 3600.0
            else:
                attendance.worked_hours = False

    @api.constrains('check_in', 'check_out')
    def _check_validity_check_in_check_out(self):
        """ verifies if check_in is earlier than check_out. """
        for attendance in self:
            if attendance.check_in and attendance.check_out:
                if attendance.check_out < attendance.check_in:
                    raise exceptions.ValidationError(_('"Check Out" time cannot be earlier than "Check In" time.'))

    @api.constrains('check_in', 'check_out', 'employee_id')
    def _check_validity(self):
        """ Verifies the validity of the attendance record compared to the others from the same employee.
            For the same employee we must have :
                * maximum 1 "open" attendance record (without check_out)
                * no overlapping time slices with previous employee records
        """
        for attendance in self:
            # we take the latest attendance before our check_in time and check it doesn't overlap with ours
            last_attendance_before_check_in = self.env['hr.attendance'].search([
                ('employee_id', '=', attendance.employee_id.id),
                ('check_in', '<=', attendance.check_in),
                ('id', '!=', attendance.id),
            ], order='check_in desc', limit=1)
            if last_attendance_before_check_in and last_attendance_before_check_in.check_out and last_attendance_before_check_in.check_out > attendance.check_in:
                raise exceptions.ValidationError(_("Cannot create new attendance record for %(empl_name)s, the employee was already checked in on %(datetime)s",
                                                   empl_name=attendance.employee_id.name,
                                                   datetime=format_datetime(self.env, attendance.check_in, dt_format=False)))

            if not attendance.check_out:
                # if our attendance is "open" (no check_out), we verify there is no other "open" attendance
                no_check_out_attendances = self.env['hr.attendance'].search([
                    ('employee_id', '=', attendance.employee_id.id),
                    ('check_out', '=', False),
                    ('id', '!=', attendance.id),
                ], order='check_in desc', limit=1)
                if no_check_out_attendances:
                    raise exceptions.ValidationError(_("Cannot create new attendance record for %(empl_name)s, the employee hasn't checked out since %(datetime)s",
                                                       empl_name=attendance.employee_id.name,
                                                       datetime=format_datetime(self.env, no_check_out_attendances.check_in, dt_format=False)))
            else:
                # we verify that the latest attendance with check_in time before our check_out time
                # is the same as the one before our check_in time computed before, otherwise it overlaps
                last_attendance_before_check_out = self.env['hr.attendance'].search([
                    ('employee_id', '=', attendance.employee_id.id),
                    ('check_in', '<', attendance.check_out),
                    ('id', '!=', attendance.id),
                ], order='check_in desc', limit=1)
                if last_attendance_before_check_out and last_attendance_before_check_in != last_attendance_before_check_out:
                    raise exceptions.ValidationError(_("Cannot create new attendance record for %(empl_name)s, the employee was already checked in on %(datetime)s",
                                                       empl_name=attendance.employee_id.name,
                                                       datetime=format_datetime(self.env, last_attendance_before_check_out.check_in, dt_format=False)))

    @api.model
    def _get_day_start_and_day(self, employee, dt):
        #Returns a tuple containing the datetime in naive UTC of the employee's start of the day
        # and the date it was for that employee
        if not dt.tzinfo:
            calendar_tz = employee._get_calendar_tz_batch(dt)[employee.id]
            date_employee_tz = pytz.utc.localize(dt).astimezone(pytz.timezone(calendar_tz))
        else:
            date_employee_tz = dt
        start_day_employee_tz = date_employee_tz.replace(hour=0, minute=0, second=0)
        return (start_day_employee_tz.astimezone(pytz.utc).replace(tzinfo=None), start_day_employee_tz.date())

    def _get_attendances_dates(self):
        # Returns a dictionnary {employee_id: set((datetimes, dates))}
        attendances_emp = defaultdict(set)
        for attendance in self.filtered(lambda a: a.check_in):
            check_in_day_start = attendance._get_day_start_and_day(attendance.employee_id, attendance.check_in)
            attendances_emp[attendance.employee_id].add(check_in_day_start)
            if attendance.check_out:
                check_out_day_start = attendance._get_day_start_and_day(attendance.employee_id, attendance.check_out)
                attendances_emp[attendance.employee_id].add(check_out_day_start)
        return attendances_emp
    def _get_rule_active_intervals(self, rule, week_start_local, week_end_local, tz):
        """
        Helper: Generates Intervals when a specific rule is active during a week.
        Considers rule's applicable days, time_from/to, and holidays.
        """
        active_intervals = Intervals()
        start_dt_local = tz.localize(datetime.combine(week_start_local, time.min))
        end_dt_local = tz.localize(datetime.combine(week_end_local, time.max))

        rule_days = {
            int(wd) for wd, apply in enumerate([
                rule.apply_monday, rule.apply_tuesday, rule.apply_wednesday,
                rule.apply_thursday, rule.apply_friday, rule.apply_saturday,
                rule.apply_sunday
            ]) if apply
        }

        # Placeholder for holiday fetching (should ideally be fetched once per employee/week)
        holidays = set()

        current_dt = start_dt_local
        while current_dt <= end_dt_local:
            current_date = current_dt.date()
            weekday = current_date.weekday() # Monday is 0
            is_holiday = current_date in holidays

            # Check applicability based on day and holiday status
            day_applicable = False
            if rule.apply_on_holidays and is_holiday:
                day_applicable = True
            # Add condition if rule *only* applies on holidays (needs extra field)
            # elif rule.only_on_holidays and not is_holiday:
            #     day_applicable = False
            elif not is_holiday and weekday in rule_days:
                 # Apply on non-holidays if weekday matches (and rule not restricted to holidays)
                 # Add check if 'only_on_holidays' field exists and is false
                 day_applicable = True
            # else: # If it's a holiday but rule doesn't apply, or weekday doesn't match
            #     day_applicable = False

            if day_applicable:
                day_start = current_dt.replace(hour=0, minute=0, second=0, microsecond=0)
                day_end = day_start + timedelta(days=1)

                # Handle time_from/to for the specific rule
                if rule.time_from is not None and rule.time_to is not None:
                    time_from_hour = int(rule.time_from)
                    time_from_min = int((rule.time_from - time_from_hour) * 60)
                    time_to_hour = int(rule.time_to)
                    time_to_min = int((rule.time_to - time_to_hour) * 60)

                    rule_start_time = time(time_from_hour, time_from_min, tzinfo=tz)
                    rule_end_time = time(time_to_hour, time_to_min, tzinfo=tz)

                    rule_start_dt = day_start.replace(hour=rule_start_time.hour, minute=rule_start_time.minute)
                    rule_end_dt = day_start.replace(hour=rule_end_time.hour, minute=rule_end_time.minute)

                    if rule.time_from <= rule.time_to: # Same day range (e.g., 09:00-17:00)
                        active_intervals |= Intervals([(max(day_start, rule_start_dt), min(day_end, rule_end_dt), rule)])
                    else: # Spans midnight (e.g., 22:00-06:00)
                        active_intervals |= Intervals([(max(day_start, rule_start_dt), day_end, rule)]) # 22:00 to 23:59:59...
                        active_intervals |= Intervals([(day_start, min(day_end, rule_end_dt), rule)]) # 00:00 to 06:00

                else: # Rule applies all day if no time range specified
                     active_intervals |= Intervals([(day_start, day_end, rule)])

            current_dt += timedelta(days=1)

        # Clip intervals to the exact week boundary (might slightly overlap due to day logic)
        week_interval = Intervals([(start_dt_local, end_dt_local, set())])
        return active_intervals & week_interval


    def _get_intervals_for_duration(self, intervals_set, duration_needed, from_end=True):
        """
        Helper: Selects intervals from a set, up to a total duration.
        Sorts intervals and iterates from start or end. Handles partial intervals.
        Returns a new Intervals object with the selected segments.
        """
        selected_intervals = Intervals()
        remaining_duration = duration_needed
        if float_compare(remaining_duration, 0.0, precision_digits=3) <= 0:
            return selected_intervals

        # Sort intervals chronologically
        sorted_intervals = sorted(intervals_set._items, key=lambda item: item[0], reverse=from_end)

        for start, end, record in sorted_intervals:
            interval_duration = (end - start).total_seconds() / 3600.0
            if float_compare(interval_duration, 0.0, precision_digits=5) <= 0:
                continue

            if interval_duration <= remaining_duration + 0.0001: # Add tolerance for float issues
                selected_intervals |= Intervals([(start, end, record)])
                remaining_duration -= interval_duration
            else:
                # Take partial interval
                duration_to_take_seconds = remaining_duration * 3600.0
                if from_end:
                    partial_start = end - timedelta(seconds=duration_to_take_seconds)
                    selected_intervals |= Intervals([(partial_start, end, record)])
                else:
                    partial_end = start + timedelta(seconds=duration_to_take_seconds)
                    selected_intervals |= Intervals([(start, partial_end, record)])
                remaining_duration = 0
                break # We have fulfilled the needed duration

            if float_compare(remaining_duration, 0.0, precision_digits=3) <= 0:
                break

        return selected_intervals


    def _get_attendances_in_period(self, employee, start_utc, end_utc):
        """ Fetches checked-out attendances for an employee within a UTC period. """
        return self.env['hr.attendance'].search([
            ('employee_id', '=', employee.id),
            ('check_in', '<', end_utc), # Attendance starts before period ends
            ('check_out', '>', start_utc), # Attendance ends after period starts
            ('check_out', '!=', False), # Must be checked out
        ])

    def _get_net_worked_intervals(self, attendance, calendar, tz):
        """ Calculates net worked intervals for one attendance, subtracting lunch breaks. """
        if not attendance.check_out or not attendance.check_in:
            return Intervals()

        check_in_local = attendance.check_in.astimezone(tz)
        check_out_local = attendance.check_out.astimezone(tz)

        gross_interval = Intervals([(check_in_local, check_out_local, attendance)])

        lunch_intervals = Intervals()
        # For non-flexible, subtract standard lunch breaks from the calendar
        # Ensure _employee_attendance_intervals helper exists and is robust
        if hasattr(attendance.employee_id, '_employee_attendance_intervals') and not attendance.employee_id.is_flexible:
            try:
                lunch_data = attendance.employee_id._employee_attendance_intervals(check_in_local, check_out_local, calendar=calendar, lunch=True)
                lunch_intervals = Intervals(lunch_data)
            except Exception as e:
                 lunch_intervals = Intervals() # Default to no lunch intervals if helper fails

        return gross_interval - lunch_intervals

    # --- Placeholder for the New Rule Processing Logic ---
    def _process_attendance_rules(self):
        """
        Processes attendance records using the configured rule engine.
        Generates hr.attendance.analysis.line records based on rules.
        """
        if not self:
            return

        # 1. Identify Scope (Employees and Date Range)
        employees = self.employee_id
        if not employees: return

        min_date = min(self.mapped('check_in')).date() if self else None
        max_date = max(att.check_out.date() for att in self if att.check_out) if self else None
        if not min_date or not max_date: # Try check_in if check_out is missing for max_date
             max_check_in = max(self.mapped('check_in')) if self else None
             if max_check_in:
                  max_date = max(max_date or date.min, max_check_in.date())
        if not min_date or not max_date:
             return

        # Expand date range slightly to ensure weeks are fully covered
        min_date -= timedelta(days=7)
        max_date += timedelta(days=7)

        employees_to_process = self.employee_id

        rulesets_ids = self.env['hr.attendance.ruleset'].search([])
        all_rules = self.env['hr.attendance.rule'].search([
            ('ruleset_id', 'in', rulesets_ids),
            ('active', '=', True)
        ])
        rules_by_ruleset = defaultdict(lambda: self.env['hr.attendance.rule'])
        for rule in all_rules:
            rules_by_ruleset[rule.ruleset_id.id] |= rule

        # Determine unique (employee, week_start_date) pairs to process
        processing_weeks = set()
        for emp in employees_to_process:
            calendar = emp.resource_calendar_id or emp.company_id.resource_calendar_id
            if not calendar: continue
            # Determine week start day from calendar (assuming first attendance day is Monday 0)
            week_start_day = int(calendar.attendance_ids[:1].dayofweek if calendar.attendance_ids else 0) # Default Monday
            current_date = min_date
            while current_date <= max_date:
                week_start = current_date - timedelta(days=(current_date.weekday() - week_start_day + 7) % 7)
                processing_weeks.add((emp.id, week_start))
                current_date = week_start + timedelta(days=7)

        analysis_lines_to_create = []

        # 3. Main Loop (Per Employee, Per Week)
        for emp_id, week_start_date in processing_weeks:
            employee = self.env['hr.employee'].browse(emp_id)
            ruleset = rulesets_ids[0] # todo : make flexible
            rules = rules_by_ruleset[ruleset.id].sorted('sequence')
            if not rules: continue

            calendar = employee.resource_calendar_id or employee.company_id.resource_calendar_id
            if not calendar:
                continue
            tz = timezone(calendar.tz)
            week_end_date = week_start_date + timedelta(days=6)

            # Clear previous analysis for this employee/week
            self.env['hr.attendance.analysis.line'].search([
                ('employee_id', '=', emp_id),
                ('date', '>=', week_start_date),
                ('date', '<=', week_end_date)
            ]).unlink()

            # Define week boundaries in UTC
            week_start_dt_local = tz.localize(datetime.combine(week_start_date, time.min))
            week_end_dt_local = tz.localize(datetime.combine(week_end_date, time.max))
            week_start_dt_utc = week_start_dt_local.astimezone(UTC).replace(tzinfo=None)
            week_end_dt_utc = week_end_dt_local.astimezone(UTC).replace(tzinfo=None)

            # Fetch Attendances for the week
            attendances = self._get_attendances_in_period(employee, week_start_dt_utc, week_end_dt_utc)
            if not attendances: continue # Skip if no attendances in the week

            # Build Net Worked Intervals (in Local Timezone)
            worked_intervals = Intervals()
            for att in attendances:
                worked_intervals |= self._get_net_worked_intervals(att, calendar, tz)

            if not worked_intervals: continue # Skip if no effective worked time

            # Initialize Tracking
            classified_intervals = Intervals()
            analysis_results_week = [] # Store dicts: {'start': dt, 'end': dt, 'rule_id': id, 'attendance_id': id}

            # Calculate initial daily/weekly totals from NET worked intervals
            daily_worked_totals = defaultdict(float)
            weekly_worked_total = 0.0
            for start, end, att_rec in worked_intervals:
                duration = (end - start).total_seconds() / 3600.0
                current_date = start.date()
                while current_date <= end.date():
                     day_start = max(start, tz.localize(datetime.combine(current_date, time.min)))
                     day_end = min(end, tz.localize(datetime.combine(current_date, time.max)))
                     if day_end > day_start:
                          day_duration = (day_end - day_start).total_seconds() / 3600.0
                          daily_worked_totals[current_date] += day_duration
                     current_date += timedelta(days=1)
                weekly_worked_total += duration


            # --- 4. Apply Rules Loop ---
            for rule in rules:
                # Get intervals where this rule's conditions (day, time, holiday) are met
                rule_active_intervals = self._get_rule_active_intervals(rule, week_start_date, week_end_date, tz)

                # Intervals that are worked AND potentially match the rule's active time, AND are not yet classified
                candidate_intervals = (worked_intervals - classified_intervals) & rule_active_intervals

                if not candidate_intervals: continue # Rule doesn't apply to any remaining time

                intervals_to_classify_by_this_rule = Intervals()

                # --- Apply Rule Logic ---
                if rule.condition_type == 'time_range':
                    # Time range rules apply directly to the intersection
                    intervals_to_classify_by_this_rule = candidate_intervals

                elif rule.condition_type == 'daily_threshold':
                    daily_classified_intervals = Intervals()
                    # Check each day within the candidate intervals
                    unique_dates = set(start.date() for start, end, rec in candidate_intervals)
                    for day in sorted(list(unique_dates)):
                        daily_total = daily_worked_totals[day]
                        # Calculate how much OT has *already* been classified *today* by previous rules
                        already_daily_ot_duration = sum(
                            (e - s).total_seconds() / 3600.0
                            for s, e, r in classified_intervals
                            if s.astimezone(tz).date() == day and r and r.id != rule.id # Check if rule is OT? Need is_overtime flag here maybe?
                            # TODO: Refine this check - needs accurate tracking of OT duration per day
                        )

                        # Determine remaining threshold
                        # We consider total work vs threshold, then allocate OT rate to applicable slots
                        excess_duration = max(0, daily_total - rule.threshold_hours)

                        if float_compare(excess_duration, 0.0, precision_digits=3) > 0:
                            # Find candidate intervals specific to this day
                            daily_candidate_intervals_today = candidate_intervals.filter(
                                lambda start, end, rec: start.astimezone(tz).date() == day
                            )
                             # How much of the excess can be covered by intervals matching this rule's time?
                            intervals_found = self._get_intervals_for_duration(
                                daily_candidate_intervals_today,
                                excess_duration, # We try to classify up to the total excess for the day
                                from_end=True # Apply OT rate to latest applicable hours
                            )
                            daily_classified_intervals |= intervals_found
                    intervals_to_classify_by_this_rule = daily_classified_intervals

                elif rule.condition_type == 'weekly_threshold':
                     # Calculate OT already classified this week by higher priority rules
                     already_weekly_ot_duration = sum(
                         (e - s).total_seconds() / 3600.0
                         for s, e, r_data in classified_intervals # r_data might be rule or analysis dict?
                         # Need a reliable way to know if a classified interval *is* overtime
                         # Let's assume we store {'is_overtime': True/False} when classifying
                         # This requires storing intermediate results differently or querying analysis lines (inefficient)
                         # Alternative: Check the rule that classified it.
                         # Simplified: Assume anything classified by a rule so far *might* be OT. Refine later.
                         # TODO: Accurately track already classified OT duration for the week
                     )

                     # Calculate excess based on total worked time vs threshold, minus already counted OT
                     excess_duration = max(0, weekly_worked_total - rule.threshold_hours - already_weekly_ot_duration)

                     if float_compare(excess_duration, 0.0, precision_digits=3) > 0:
                          # Try to classify remaining applicable intervals up to the excess duration
                          intervals_to_classify_by_this_rule = self._get_intervals_for_duration(
                              candidate_intervals, # Only consider intervals matching rule's time
                              excess_duration,
                              from_end=True # Apply to latest hours in the week
                          )

                # --- Store results for this rule ---
                if intervals_to_classify_by_this_rule:
                    for start, end, att_rec in intervals_to_classify_by_this_rule:
                         # Convert back to UTC for storage consistency if needed, but store rule context
                         analysis_results_week.append({
                             'start': start, # Keep local for now
                             'end': end,     # Keep local for now
                             'rule_id': rule.id,
                             'attendance_id': att_rec.id,
                             'date': start.date(), # Date in local timezone
                         })
                    # Mark these intervals as claimed
                    classified_intervals |= intervals_to_classify_by_this_rule


            # --- 5. Handle Standard Time ---
            standard_intervals = worked_intervals - classified_intervals
            for start, end, att_rec in standard_intervals:
                 analysis_results_week.append({
                     'start': start, # Keep local
                     'end': end,     # Keep local
                     'rule_id': None, # No specific rule
                     'attendance_id': att_rec.id,
                     'date': start.date(), # Date in local timezone
                 })

            # --- 6. Convert Results and Prepare for Creation ---
            for result in analysis_results_week:
                start_local = result['start']
                end_local = result['end']
                # Convert back to UTC for analysis line storage
                start_utc = start_local.astimezone(UTC).replace(tzinfo=None)
                end_utc = end_local.astimezone(UTC).replace(tzinfo=None)

                analysis_lines_to_create.append({
                    'attendance_id': result['attendance_id'],
                    'rule_id': result['rule_id'],
                    'date': result['date'],
                    'start_dt': start_utc,
                    'end_dt': end_utc,
                    # Computed fields (duration, is_overtime, rates) will be calculated by ORM
                })

        # --- 7. Create Analysis Lines ---
        if analysis_lines_to_create:
            self.env['hr.attendance.analysis.line'].create(analysis_lines_to_create)


    # --- CRUD Methods ---
    @api.model_create_multi
    def create(self, vals_list):
        attendances = super().create(vals_list)
        # Trigger rule processing after creation (for completed attendances)
        attendances.filtered(lambda a: a.check_out)._process_attendance_rules()
        return attendances

    def write(self, vals):
        # Store which records might need reprocessing
        attendances_to_reprocess = self.env['hr.attendance']
        if any(field in vals for field in ['employee_id', 'check_in', 'check_out']):
            # Identify records potentially affected by the change
            attendances_to_reprocess = self # Reprocess the records being written

        result = super().write(vals)

        # Reprocess affected records if check_in/out exists
        attendances_to_reprocess.filtered(lambda a: a.check_in and a.check_out)._process_attendance_rules()

        # If check_out was just added, process self
        if 'check_out' in vals and vals['check_out']:
             self.filtered(lambda a: a.check_in)._process_attendance_rules()

        return result

    def unlink(self):
        # Clean up related analysis lines before unlinking attendances
        self.env['hr.attendance.analysis.line'].search([('attendance_id', 'in', self.ids)]).unlink()
        # Need to potentially reprocess other attendances if unlink affects weekly totals
        # For simplicity now, we don't reprocess neighbours on unlink, but a robust solution might.
        # attendances_dates = self._get_attendances_dates() # Might need adaptation
        res = super().unlink()
        # self._reprocess_affected_periods(attendances_dates) # Placeholder for reprocessing logic
        return res


    def copy(self, default=None):
        raise exceptions.UserError(_('You cannot duplicate an attendance.'))

    def action_in_attendance_maps(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_url',
            'url': get_google_maps_url(self.in_latitude, self.in_longitude),
            'target': 'new'
        }

    def action_out_attendance_maps(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_url',
            'url': get_google_maps_url(self.out_latitude, self.out_longitude),
            'target': 'new'
        }

    def get_kiosk_url(self):
        return self.get_base_url() + "/hr_attendance/" + self.env.company.attendance_kiosk_key

    @api.model
    def has_demo_data(self):
        if not self.env.user.has_group("hr_attendance.group_hr_attendance_manager"):
            return True
        # This record only exists if the scenario has been already launched
        demo_tag = self.env.ref('hr_attendance.resource_calendar_std_38h', raise_if_not_found=False)
        return bool(demo_tag) or bool(self.env['ir.module.module'].search_count([('demo', '=', True)]))

    def _load_demo_data(self):
        if self.has_demo_data():
            return
        self.env['hr.employee']._load_scenario()
        # Load employees, schedules, departments and partners
        convert.convert_file(self.env, 'hr_attendance', 'data/scenarios/hr_attendance_scenario.xml', None, mode='init', kind='data')

        employee_sj = self.env.ref('hr.employee_sj')
        employee_mw = self.env.ref('hr.employee_mw')
        employee_eg = self.env.ref('hr.employee_eg')

        # Retrieve employee from xml file
        # Calculate attendances records for the previous month and the current until today
        now = datetime.now()
        previous_month_datetime = (now - relativedelta(months=1))
        date_range = now.day + monthrange(previous_month_datetime.year, previous_month_datetime.month)[1]
        city_coordinates = (50.27, 5.31)
        city_coordinates_exception = (51.01, 2.82)
        city_dict = {
                    'latitude': city_coordinates_exception[0],
                    'longitude': city_coordinates_exception[1],
                    'city': 'Rellemstraat'
                }
        city_exception_dict = {
            'latitude': city_coordinates[0],
            'longitude': city_coordinates[1],
            'city': 'Waillet'
        }
        attendance_values = []
        for i in range(1, date_range):
            check_in_date = now.replace(hour=6, minute=0, second=randint(0, 59)) + timedelta(days=-i, minutes=randint(-2, 3))
            if check_in_date.weekday() not in range(0, 5):
                continue
            check_out_date = now.replace(hour=10, minute=0, second=randint(0, 59)) + timedelta(days=-i, minutes=randint(-2, -1))
            check_in_date_after_lunch = now.replace(hour=11, minute=0, second=randint(0, 59)) + timedelta(days=-i, minutes=randint(-2, -1))
            check_out_date_after_lunch = now.replace(hour=15, minute=0, second=randint(0, 59)) + timedelta(days=-i, minutes=randint(1, 3))

            # employee_eg doesn't work on friday
            eg_data = []
            if check_in_date.weekday() != 4:
                # employee_eg will compensate her work's hours between weeks.
                if check_in_date.isocalendar().week % 2:
                    employee_eg_hours = {
                        'check_in_date': check_in_date + timedelta(hours=1),
                        'check_out_date': check_out_date,
                        'check_in_date_after_lunch': check_in_date_after_lunch,
                        'check_out_date_after_lunch': check_out_date_after_lunch + timedelta(hours=-1),
                    }
                else:
                    employee_eg_hours = {
                        'check_in_date': check_in_date,
                        'check_out_date': check_out_date,
                        'check_in_date_after_lunch': check_in_date_after_lunch,
                        'check_out_date_after_lunch': check_out_date_after_lunch + timedelta(hours=1, minutes=30),
                    }
                eg_data = [{
                    'employee_id': employee_eg.id,
                    'check_in': employee_eg_hours['check_in_date'],
                    'check_out': employee_eg_hours['check_out_date'],
                    'in_mode': "kiosk",
                    'out_mode': "kiosk"
                }, {
                    'employee_id': employee_eg.id,
                    'check_in': employee_eg_hours['check_in_date_after_lunch'],
                    'check_out': employee_eg_hours['check_out_date_after_lunch'],
                    'in_mode': "kiosk",
                    'out_mode': "kiosk",
                }]

            # calculate GPS coordination for employee_mw (systray attendance)
            if randint(1, 10) == 1:
                city_data = city_exception_dict
            else:
                city_data = city_dict
            mw_data = [{
                'employee_id': employee_mw.id,
                'check_in': check_in_date,
                'check_out': check_out_date,
                'in_mode': "systray",
                'out_mode': "systray",
                'in_longitude': city_data['longitude'],
                'out_longitude': city_data['longitude'],
                'in_latitude': city_data['latitude'],
                'out_latitude': city_data['latitude'],
                'in_city': city_data['city'],
                'out_city': city_data['city'],
                'in_ip_address': "127.0.0.1",
                'out_ip_address': "127.0.0.1",
                'in_browser': 'chrome',
                'out_browser': 'chrome'
            }, {
                'employee_id': employee_mw.id,
                'check_in': check_in_date_after_lunch,
                'check_out': check_out_date_after_lunch,
                'in_mode': "systray",
                'out_mode': "systray",
                'in_longitude': city_data['longitude'],
                'out_longitude': city_data['longitude'],
                'in_latitude': city_data['latitude'],
                'out_latitude': city_data['latitude'],
                'in_city': city_data['city'],
                'out_city': city_data['city'],
                'in_ip_address': "127.0.0.1",
                'out_ip_address': "127.0.0.1",
                'in_browser': 'chrome',
                'out_browser': 'chrome'
            }]
            sj_data = [{
                'employee_id': employee_sj.id,
                'check_in': check_in_date + timedelta(minutes=randint(-10, -5)),
                'check_out': check_out_date,
                'in_mode': "manual",
                'out_mode': "manual"
            }, {
                'employee_id': employee_sj.id,
                'check_in': check_in_date_after_lunch,
                'check_out': check_out_date_after_lunch + timedelta(hours=1, minutes=randint(-20, 10)),
                'in_mode': "manual",
                'out_mode': "manual"
            }]
            attendance_values.extend(eg_data + mw_data + sj_data)
        self.env['hr.attendance'].create(attendance_values)
        return {
            'type': 'ir.actions.client',
            'tag': 'reload',
        }

    def action_try_kiosk(self):
        if not self.env.user.has_group("hr_attendance.group_hr_attendance_manager"):
            return {
                    'type': 'ir.actions.client',
                    'tag': 'display_notification',
                    'params': {
                        'message': _("You don't have the rights to execute that action."),
                        'type': 'info',
                    }
            }
        return {
            'type': 'ir.actions.act_url',
            'target': 'self',
            'url': self.env.company.attendance_kiosk_url + '?from_trial_mode=True'
        }

    def _read_group_employee_id(self, resources, domain):
        user_domain = self.env.context.get('user_domain')
        employee_domain = [('company_id', 'in', self.env.context.get('allowed_company_ids', []))]
        if not self.env.user.has_group('hr_attendance.group_hr_attendance_manager'):
            employee_domain.append(('attendance_manager_id', '=', self.env.user.id))
        if not user_domain:
            return self.env['hr.employee'].search(employee_domain)
        else:
            employee_name_domain = []
            for leaf in user_domain:
                if len(leaf) == 3 and leaf[0] == 'employee_id':
                    employee_name_domain.append([('name', leaf[1], leaf[2])])
            return resources | self.env['hr.employee'].search(AND([OR(employee_name_domain), employee_domain]))

