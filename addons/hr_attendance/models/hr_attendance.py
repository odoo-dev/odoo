# Part of Odoo. See LICENSE file for full copyright and licensing details.

from calendar import monthrange
from collections import defaultdict
from datetime import UTC, datetime, time, timedelta
from random import randint, uniform
from zoneinfo import ZoneInfo

from dateutil.relativedelta import relativedelta
from markupsafe import Markup

from odoo import _, api, exceptions, fields, models
from odoo.exceptions import AccessError, ValidationError
from odoo.fields import Domain
from odoo.tools import convert, float_compare, float_is_zero, format_datetime
from odoo.tools.date_utils import float_to_time, sum_intervals, time_to_float
from odoo.tools.intervals import Intervals


def get_google_maps_url(latitude, longitude):
    return "https://maps.google.com?q=%s,%s" % (latitude, longitude)


class HrAttendance(models.Model):
    _name = 'hr.attendance'
    _description = "Attendance"
    _order = "check_in desc"
    _inherit = ["mail.thread", "hr.time.rule.source.mixin"]

    _time_rule_source_field = 'source_attendance_id'
    _time_rule_output_field = 'overtime_attendance_ids'
    _time_rule_span_start_field = 'check_in'
    _time_rule_span_end_field = 'check_out'

    def _default_employee(self):
        return self.env.user.employee_id

    employee_id = fields.Many2one('hr.employee', string="Employee", default=_default_employee, required=True,
        ondelete='cascade', index=True)
    department_id = fields.Many2one('hr.department', string="Department", related="employee_id.department_id",
        readonly=True)
    manager_id = fields.Many2one(comodel_name='hr.employee', related="employee_id.parent_id", readonly=True,
        export_string_translation=False)
    attendance_manager_id = fields.Many2one('res.users', related="employee_id.attendance_manager_id",
        export_string_translation=False)
    is_manager = fields.Boolean(compute="_compute_is_manager")
    is_own = fields.Boolean(compute="_compute_is_manager")
    can_edit = fields.Boolean(compute="_compute_can_edit")
    check_in = fields.Datetime(string="Check In", default=fields.Datetime.now, required=True, tracking=True, index=True)
    check_out = fields.Datetime(string="Check Out", tracking=True)
    date = fields.Date(string="Date", compute='_compute_date', store=True, index=True, precompute=True, required=True)
    worked_hours = fields.Float(string='Worked Hours', compute='_compute_worked_hours', store=True, readonly=True)
    # color index of the status, used by all views
    color = fields.Integer(compute='_compute_color', export_string_translation=False)
    in_latitude = fields.Float(string="Check In Latitude", digits=(10, 7), readonly=True, aggregator=None)
    in_longitude = fields.Float(string="Check In Longitude", digits=(10, 7), readonly=True, aggregator=None)
    in_location = fields.Char(string="Check In Location", help="Based on GPS-Coordinates if available or on IP Address", tracking=True)
    in_ip_address = fields.Char(string="Check In IP Address", readonly=True, tracking=True)
    in_browser = fields.Char(string="Check In Browser", readonly=True, tracking=True)
    in_mode = fields.Selection(string="Check In Mode",
                               selection=[('kiosk', "Kiosk"),
                                          ('systray', "Systray"),
                                          ('manual', "Manual"),
                                          ('technical', 'Technical')],
                               readonly=True,
                               default='manual',
                               tracking=True)
    in_image = fields.Binary(string="Check-In Image")
    out_latitude = fields.Float(string="Check Out Latitude", digits=(10, 7), readonly=True, aggregator=None)
    out_longitude = fields.Float(string="Check Out Longitude", digits=(10, 7), readonly=True, aggregator=None)
    out_location = fields.Char(string="Check Out Location", help="Based on GPS-Coordinates if available or on IP Address", tracking=True)
    out_ip_address = fields.Char(string="Check Out IP Address", readonly=True, tracking=True)
    out_browser = fields.Char(string="Check Out Browser", readonly=True, tracking=True)
    out_mode = fields.Selection(string="Check Out Mode",
                                selection=[('kiosk', "Kiosk"),
                                           ('systray', "Systray"),
                                           ('manual', "Manual"),
                                           ('technical', 'Technical'),
                                           ('auto_check_out', 'Forgot')],
                                readonly=True,
                                tracking=True)
    device_tracking_enabled = fields.Boolean(related="employee_id.company_id.attendance_device_tracking")
    resource_calendar_id = fields.Many2one(related='employee_id.resource_calendar_id', string="Working Schedule")
    break_duration = fields.Float(string="Break Duration", tracking=True, help="Extra unpaid break duration (hours)")
    work_entry_type_id = fields.Many2one(
        'hr.work.entry.type', string="Time Type", index=True, required=True,
        default=lambda self: self.env.company.sudo().attendance_work_entry_type_id,
    )
    wet_display_code = fields.Char(related='work_entry_type_id.display_code', export_string_translation=False)

    state = fields.Selection([
        ('draft', 'To Review'),
        ('validated', 'Reviewed'),
        ('refused', 'Refused'),
    ], string='Status', required=True, default='draft', index=True, tracking=True, readonly=True, copy=False)
    is_late_check_in = fields.Boolean(
        string="Late Clock In", compute='_compute_schedule_flags', store=True,
        help="Checked in after the start of a scheduled working period, beyond the validation tolerance.")
    is_early_check_out = fields.Boolean(
        string="Early Clock Out", compute='_compute_schedule_flags', store=True,
        help="Checked out before the end of a scheduled working period, beyond the validation tolerance.")

    # time rule engine output fields
    time_rule_id = fields.Many2one('hr.time.rule', index=True)
    source_attendance_id = fields.Many2one('hr.attendance', index=True)
    overtime_attendance_ids = fields.One2many('hr.attendance', 'source_attendance_id')
    has_overtime = fields.Boolean(compute='_compute_has_overtime', search='_search_has_overtime', export_string_translation=False)
    # set to True on surviving output records when their source is modified or deleted
    source_stale = fields.Boolean(default=False, copy=False, export_string_translation=False)

    @api.depends("check_in", "employee_id")
    def _compute_date(self):
        for attendance in self:
            if not attendance.employee_id or not attendance.check_in:  # weird precompute edge cases. Never after creation
                attendance.date = datetime.today()
                continue
            tz = ZoneInfo(attendance.employee_id._get_tz())
            attendance.date = attendance.check_in.replace(tzinfo=UTC).astimezone(tz).date()

    @api.depends('check_in', 'check_out', 'employee_id')
    def _compute_schedule_flags(self):
        # these flags also depend on the other attendances of the day: see _recompute_schedule_flags
        for attendance in self:
            attendance.is_late_check_in = attendance.is_early_check_out = False
            if not attendance.employee_id or not attendance.check_in:
                continue
            employee = attendance.employee_id
            tz = ZoneInfo(employee._get_tz())
            day_start = datetime.combine(attendance.check_in.replace(tzinfo=UTC).astimezone(tz).date(), time.min, tz)
            schedule = [
                (start.astimezone(UTC).replace(tzinfo=None), stop.astimezone(UTC).replace(tzinfo=None))
                for start, stop, _dummy in employee._get_expected_attendances(day_start, day_start + timedelta(days=1))
            ]
            if not schedule:
                continue
            tolerance = timedelta(minutes=employee.company_id.attendance_validation_tolerance)
            others = [('id', '!=', attendance.id), ('employee_id', '=', employee.id)]
            period = next(((start, stop) for start, stop in schedule if start < attendance.check_in < stop), None)
            # coming back during a period already started (e.g. after a break) is not late
            attendance.is_late_check_in = bool(period) and attendance.check_in > period[0] + tolerance \
                and not self.sudo().search_count(others + [
                    ('check_in', '<', attendance.check_in),
                    ('check_out', '>', period[0]),
                ], limit=1)
            if not attendance.check_out:
                continue
            period = next(((start, stop) for start, stop in schedule if start < attendance.check_out < stop), None)
            # leaving for a break and coming back during the same period is not early
            attendance.is_early_check_out = bool(period) and attendance.check_out < period[1] - tolerance \
                and not self.sudo().search_count(others + [
                    ('check_in', '>', attendance.check_out),
                    ('check_in', '<', period[1]),
                ], limit=1)

    def _recompute_schedule_flags(self):
        """ Recompute the flags of the other attendances of the same days, as
        they depend on these ones (e.g. a check-in after a break). """
        siblings = self.sudo().search([
            ('employee_id', 'in', self.employee_id.ids),
            ('date', 'in', list(set(self.mapped('date')))),
            ('id', 'not in', self.ids),
        ])
        for fname in ('is_late_check_in', 'is_early_check_out'):
            self.env.add_to_compute(self._fields[fname], siblings)

    @api.depends('overtime_attendance_ids')
    def _compute_has_overtime(self):
        for attendance in self:
            attendance.has_overtime = bool(attendance.overtime_attendance_ids)

    def _search_has_overtime(self, operator, value):
        if operator != 'in':
            return NotImplemented
        if True in value and False in value:
            return Domain.TRUE
        return [('overtime_attendance_ids', '!=' if True in value else '=', False)]

    @api.depends('state')
    def _compute_color(self):
        colors = {'draft': 4, 'validated': 10, 'refused': 0}  # blue, green, light grey
        for attendance in self:
            attendance.color = colors.get(attendance.state, 0)

    @api.depends('employee_id.name', 'check_in', 'check_out', 'work_entry_type_id', 'source_stale')
    @api.depends_context('my_attendances', 'attendance_hide_employee')
    def _compute_display_name(self):
        # the employee is omitted when obvious: my attendances, or the view
        # filters or groups on one employee (see attendance_display_name.js)
        show_employee = not (
            self.env.context.get('my_attendances') or self.env.context.get('attendance_hide_employee')
        )
        for attendance in self:
            wet = attendance.work_entry_type_id
            wet_name = wet.display_code or wet.name or ''
            if not attendance.check_out:
                name = wet_name or _("In Progress")
            else:
                total_mins = round(attendance.worked_hours * 60)
                h, m = divmod(total_mins, 60)
                dur = f"{h}h {m}m" if m else f"{h}h"
                name = f"{wet_name} - {dur}" if wet_name else dur
            if show_employee and attendance.employee_id:
                name = f"{attendance.employee_id.name}: {name}"
            attendance.display_name = f"⚠ {name}" if attendance.source_stale else name

    @api.depends_context('uid')
    @api.depends('employee_id')
    def _compute_is_manager(self):
        have_manager_right = self.env.user.has_group('hr_attendance.group_hr_attendance_user')
        have_officer_right = self.env.user.has_group('hr_attendance.group_hr_attendance_officer')
        have_own_right = self.env.user.has_group('hr_attendance.group_hr_attendance_own')
        for attendance in self:
            attendance.is_manager = have_manager_right or \
                (have_officer_right and attendance.attendance_manager_id.id == self.env.user.id)
            attendance.is_own = have_own_right and attendance.employee_id.user_id == self.env.user

    @api.depends('is_manager', 'is_own')
    def _compute_can_edit(self):
        for attendance in self:
            attendance.can_edit = attendance.is_manager or attendance.is_own

    @api.depends('check_in', 'check_out', 'break_duration')
    def _compute_worked_hours(self):
        """ Computes the worked hours of the attendance record.
            The worked hours of resource with flexible calendar is computed as the difference
            between check_in and check_out, without taking into account the lunch_interval"""
        for attendance in self:
            if attendance.check_out and attendance.check_in and attendance.employee_id:
                attendance.worked_hours = (
                    time_to_float(attendance.check_out - attendance.check_in)
                ) - attendance.break_duration
            else:
                attendance.worked_hours = False

    @api.constrains('break_duration', 'check_in', 'check_out')
    def _check_break_duration(self):
        for attendance in self:
            if float_compare(attendance.break_duration, 0.0, precision_digits=4) < 0:
                raise ValidationError(self.env._("Break duration cannot be negative."))
            if not attendance.check_out and not float_is_zero(attendance.break_duration, precision_digits=4):
                raise ValidationError(self.env._(
                    "You can only set a break duration once the employee has checked out."
                ))
            if attendance.check_in and attendance.check_out and attendance.break_duration:
                total_hours = time_to_float(attendance.check_out - attendance.check_in)
                if float_compare(attendance.break_duration, total_hours, precision_digits=4) > 0:
                    raise ValidationError(self.env._("Breaks cannot be longer than the attendance time"))

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
        if self.env.context.get('skip_time_rules'):
            return
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

    # fields whose change on a source attendance should warn surviving outputs
    _STALE_TRIGGER_FIELDS = frozenset({'check_in', 'check_out', 'break_duration', 'employee_id', 'work_entry_type_id'})
    # check in/out modes recorded by the system rather than typed by someone
    _AUTOMATIC_MODES = frozenset({'systray', 'kiosk', 'technical', 'auto_check_out'})
    # fields whose manual change by an employee requires a new review
    _REVIEW_TRIGGER_FIELDS = frozenset({'check_in', 'check_out', 'break_duration'})

    def _is_attendance_reviewer(self):
        return self.env.su or self.env.user.has_group('hr_attendance.group_hr_attendance_officer')

    def write(self, vals):
        if vals.get('state') == 'refused' and not self.env.context.get('skip_time_rules'):
            # refusing (e.g. from the clickable statusbar) behaves like action_refuse
            return self.with_context(skip_time_rules=True).write(vals)
        if vals.get('state') in ('validated', 'refused') and not self._is_attendance_reviewer():
            raise AccessError(_("Only attendance officers can review attendances."))
        if (
            'state' not in vals
            and self._REVIEW_TRIGGER_FIELDS & vals.keys()
            and not self.env.context.get('skip_time_rules')
            and not self._is_attendance_reviewer()
            and vals.get('out_mode', vals.get('in_mode')) not in self._AUTOMATIC_MODES
        ):
            # an employee changing their attendance manually: it must be reviewed again
            vals = {**vals, 'state': 'draft'}
        if vals.get('employee_id') and \
            vals['employee_id'] not in self.env.user.employee_ids.ids and \
            not self.env.user.has_group('hr_attendance.group_hr_attendance_manager') and \
            self.env['hr.employee'].sudo().browse(vals['employee_id']).attendance_manager_id.id != self.env.user.id:
            raise AccessError(_("Do not have access, user cannot edit the attendances that are not their own or if they are not the attendance manager of the employee."))
        # snapshot existing output ids before the pipeline runs so that newly
        # created outputs (fresh, accurate) are not incorrectly marked stale
        stale_targets = self.env['hr.attendance']
        if self._STALE_TRIGGER_FIELDS & vals.keys():
            stale_targets = self.sudo().mapped('overtime_attendance_ids').filtered('id')
        # checking out without a mode (e.g. from the form) is a manual check out
        without_out_mode = self.filtered(lambda a: not a.out_mode) if vals.get('check_out') and 'out_mode' not in vals else self.browse()
        result = super().write(vals)
        if without_out_mode:
            without_out_mode.write({'out_mode': 'manual'})
        for prefix in ('in', 'out'):
            if {f'{prefix}_latitude', f'{prefix}_longitude'} & vals.keys():
                self._log_gps_coordinates(prefix)
        if stale_targets:
            stale_targets.exists().with_context(skip_time_rules=True).write({'source_stale': True})
        if {'check_in', 'check_out', 'employee_id'} & vals.keys():
            self._recompute_schedule_flags()
        if 'check_out' in vals and not self.env.context.get('skip_time_rules') and vals.get('state', 'draft') == 'draft':
            to_check = self._update_tolerance_state()
            if vals.get('out_mode') in ('systray', 'kiosk'):
                to_check |= self
            to_check._review_exceptions()
        return result

    @api.ondelete(at_uninstall=False)
    def _mark_outputs_stale_on_delete(self):
        outputs = self.sudo().mapped('overtime_attendance_ids').filtered('id')
        if outputs:
            outputs.with_context(skip_time_rules=True).write({'source_stale': True})

    def action_mark_reviewed(self):
        self.with_context(skip_time_rules=True).write({'source_stale': False})

    def copy(self, default=None):
        raise exceptions.UserError(_('You cannot duplicate an attendance.'))

    def _get_gps_coordinates_link(self, prefix):
        self.ensure_one()
        latitude, longitude = self[f'{prefix}_latitude'], self[f'{prefix}_longitude']
        if not latitude and not longitude:
            return False
        return Markup('<a href="%s" target="_blank">%s, %s</a>') % (
            get_google_maps_url(latitude, longitude), latitude, longitude)

    def _log_gps_coordinates(self, prefix):
        label = _("Locate Check In in map") if prefix == 'in' else _("Locate Check Out in map")
        for attendance in self:
            if link := attendance._get_gps_coordinates_link(prefix):
                attendance._message_log(body=Markup('%s: %s') % (label, link))

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

    def _creation_message(self):
        # Tracking only logs changes: log the check-in values at creation
        self.ensure_one()
        lines = [_("Checked in (%(mode)s)", mode=dict(
            self._fields['in_mode']._description_selection(self.env)).get(self.in_mode, ''))]
        for fname in ('in_location', 'in_ip_address', 'in_browser'):
            if self[fname]:
                lines.append(Markup('%s: %s') % (self._fields[fname]._description_string(self.env), self[fname]))
        if link := self._get_gps_coordinates_link('in'):
            lines.append(Markup('%s: %s') % (_("Locate Check In in map"), link))
        return Markup('<br/>').join(lines)

    @api.model
    def _get_dashboard_cards(self):
        """ KPI cards displayed on top of the attendance list view: each card
        counts the records matching a filter of the search view. """
        return [
            {'filter': 'state_draft', 'label': _("To Review"), 'color': 'orange', 'domain': [('state', '=', 'draft')]},
            {'filter': 'nocheckout', 'label': _("At Work"), 'color': 'yellow', 'domain': [('check_out', '=', False)]},
            {'filter': 'late_check_in', 'label': _("Late Clock In"), 'color': 'red', 'domain': [('is_late_check_in', '=', True)]},
            {'filter': 'early_check_out', 'label': _("Early Clock Out"), 'color': 'purple', 'domain': [('is_early_check_out', '=', True)]},
            {'filter': 'overtime', 'label': _("Overtime"), 'color': 'blue', 'domain': [('has_overtime', '=', True)]},
        ]

    @api.model
    def get_attendance_dashboard(self):
        base_domain = Domain('employee_id.active', '=', True)
        return [
            {
                'filter': card['filter'],
                'label': card['label'],
                'color': card['color'],
                'count': self.search_count(base_domain & Domain(card['domain'])),
            }
            for card in self._get_dashboard_cards()
        ]

    @api.model
    def get_empty_list_help(self, help_message):
        if self.env.context.get('attendance_welcome_help'):
            name = self.env.user.employee_id.name or self.env.user.name
            help_message = Markup('<h3>%s</h3><h1>%s</h1>%s') % (
                _("Welcome,"), name, Markup(help_message or ''))
        return super().get_empty_list_help(help_message)

    @api.model
    def has_demo_data(self):
        if not self.env.user.has_group("hr_attendance.group_hr_attendance_user"):
            return True
        # This record only exists if the scenario has been already launched
        demo_tag = self.env.ref('hr_attendance.resource_calendar_std_38h', raise_if_not_found=False)
        return bool(demo_tag) or bool(self.env['ir.module.module'].search_count([('demo', '=', True)]))

    def _load_demo_data(self):
        if self.has_demo_data():
            return
        env_sudo = self.sudo().with_context({}).env
        env_sudo['hr.employee']._load_scenario()
        # Load employees, schedules, departments and partners
        convert.convert_file(env_sudo, 'hr_attendance', 'data/scenarios/hr_attendance_scenario.xml', None, mode='init')

        employee_sj = self.env.ref('hr.employee_sj')
        employee_mw = self.env.ref('hr.employee_mw')
        employee_eg = self.env.ref('hr.employee_eg')

        # Retrieve employee from xml file
        # Calculate attendances records for the previous month and the current until today
        now = datetime.now()
        previous_month_datetime = (now - relativedelta(months=1))
        # Ensure employees have a valid contract start date (so attendances render in the Gantt view)
        employees = employee_sj | employee_mw | employee_eg
        employees.write({
            'contract_date_start': (now - relativedelta(months=2)).date(),
        })
        date_range = now.day + monthrange(previous_month_datetime.year, previous_month_datetime.month)[1]
        city_dict = {'latitude': 37.7898, 'longitude': -122.3942, 'city': 'San Francisco'}
        city_exception_dict = {'latitude': 37.8044, 'longitude': -122.2712, 'city': 'Oakland'}
        kiosk_dict = {'latitude': 37.4419, 'longitude': -122.1430, 'city': 'Palo Alto'}

        def gps_values(city_data):
            # spread the pins a little around the city center
            latitude = city_data['latitude'] + uniform(-0.01, 0.01)
            longitude = city_data['longitude'] + uniform(-0.01, 0.01)
            return {
                'in_latitude': latitude,
                'out_latitude': latitude,
                'in_longitude': longitude,
                'out_longitude': longitude,
                'in_location': city_data['city'],
                'out_location': city_data['city'],
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
                    'out_mode': "kiosk",
                    **gps_values(kiosk_dict),
                }, {
                    'employee_id': employee_eg.id,
                    'check_in': employee_eg_hours['check_in_date_after_lunch'],
                    'check_out': employee_eg_hours['check_out_date_after_lunch'],
                    'in_mode': "kiosk",
                    'out_mode': "kiosk",
                    **gps_values(kiosk_dict),
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
                **gps_values(city_data),
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
                **gps_values(city_data),
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
        if not self.env.user.has_group("hr_attendance.group_hr_attendance_user"):
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

    def _cron_auto_check_out(self):
        self._cron_auto_check_out_tolerance()
        self._cron_auto_check_out_specific_time()

    def _cron_auto_check_out_tolerance(self):
        def check_in_tz(attendance):
            """Returns check-in time in calendar's timezone."""
            return attendance.check_in.astimezone(ZoneInfo(attendance.employee_id._get_tz(attendance.date)))

        to_verify = self.env['hr.attendance'].search(
            [('check_out', '=', False),
             ('employee_id.company_id.auto_check_out', '=', True),
             ('employee_id.company_id.auto_check_out_mode', '=', 'tolerance'),
             ('employee_id.resource_calendar_id.calendar_type', '!=', 'undefined')]
        )

        if not to_verify:
            return

        to_verify_min_date = min(to_verify.mapped('check_in')).replace(hour=0, minute=0, second=0)
        previous_attendances = self.env['hr.attendance'].search([
                    ('employee_id', 'in', to_verify.mapped('employee_id').ids),
                    ('check_in', '>', to_verify_min_date),
                    ('check_out', '!=', False)
        ])

        mapped_previous_duration = defaultdict(lambda: defaultdict(float))
        for previous in previous_attendances:
            mapped_previous_duration[previous.employee_id][check_in_tz(previous).date()] += previous.worked_hours

        all_companies = to_verify.employee_id.company_id

        for company in all_companies:
            max_tol = company.auto_check_out_tolerance
            to_verify_company = to_verify.filtered(lambda a: a.employee_id.company_id.id == company.id)

            for att in to_verify_company:

                employee_timezone = ZoneInfo(att.employee_id._get_tz(att.date))
                check_in_datetime = check_in_tz(att)
                now_datetime = fields.Datetime.now().astimezone(employee_timezone)
                current_attendance_duration = (now_datetime - check_in_datetime).total_seconds() / 3600
                previous_attendances_duration = mapped_previous_duration[att.employee_id][check_in_datetime.date()]

                check_in_day_start = check_in_datetime.replace(hour=0, minute=0, second=0, microsecond=0)
                expected_worked_hours = sum_intervals(
                    att.employee_id._get_expected_attendances(
                        check_in_day_start,
                        check_in_day_start + timedelta(days=1),
                    )
                )

                # Attendances where Last open attendance time + previously worked time on that day + tolerance greater than the attendances hours (including lunch) in his calendar
                if (current_attendance_duration + previous_attendances_duration - max_tol) > expected_worked_hours:
                    att.with_context(skip_time_rules=True).check_out = check_in_datetime.replace(hour=23, minute=59, second=59).astimezone(UTC).replace(tzinfo=None)
                    excess_hours = att.worked_hours - (expected_worked_hours + max_tol - previous_attendances_duration)
                    att.write({
                        "check_out": max(att.check_out - relativedelta(hours=excess_hours), att.check_in + relativedelta(seconds=1)),
                        "out_mode": "auto_check_out"
                    })
                    att.message_post(
                        body=_('This attendance was automatically checked out because the employee exceeded the allowed time for their scheduled work hours.')
                    )

    def _cron_absence_detection(self):
        """Create a 1-second technical attendance for each employee who did not check in yesterday.

        This triggers the time rule pipeline so that undertime rules can generate
        output attendances for the missed schedule hours.  The attendance type is set
        to the company's default so condition filters on undertime rules match it.
        Technical attendances that produce no time rule output are discarded afterwards.
        """
        yesterday = datetime.today().replace(hour=0, minute=0, second=0) - relativedelta(days=1)
        companies = self.env['res.company'].search([('absence_management', '=', True)])
        if not companies:
            return

        checked_in_employees = self.env['hr.attendance'].search([('date', '=', yesterday)]).employee_id

        technical_attendances_vals = []
        absent_employees = self.env['hr.employee'].search([
            ('id', 'not in', checked_in_employees.ids),
            ('company_id', 'in', companies.ids),
            ('resource_calendar_id', '!=', False),
            ('current_version_id.contract_date_start', '<=', yesterday.date()),
            '|',
                ('current_version_id.contract_date_end', '=', False),
                ('current_version_id.contract_date_end', '>=', yesterday.date()),
        ])

        for emp in absent_employees:
            local_day_start = yesterday.replace(tzinfo=ZoneInfo(emp._get_tz()))
            check_in_utc = local_day_start.astimezone(UTC)
            technical_attendances_vals.append({
                'check_in': check_in_utc.strftime('%Y-%m-%d %H:%M:%S'),
                'check_out': (check_in_utc + relativedelta(seconds=1)).strftime('%Y-%m-%d %H:%M:%S'),
                'work_entry_type_id': emp.company_id.attendance_work_entry_type_id.id,
                'in_mode': 'technical',
                'out_mode': 'technical',
                'employee_id': emp.id,
                'state': 'validated',
            })

        technical_attendances = self.env['hr.attendance'].create(technical_attendances_vals)
        to_unlink = technical_attendances.filtered(lambda a: not a.overtime_attendance_ids)
        body = _('This attendance was automatically created to cover an unjustified absence on that day.')
        for technical_attendance in technical_attendances:
            technical_attendance.message_post(body=body)

        to_unlink.unlink()

    def _cron_auto_check_out_specific_time(self):
        """
        Automatically check-out all employees still checked in
        when company is in 'specific_time' mode.
        """
        current_utc_dt = fields.Datetime.now()
        utc_tz = ZoneInfo('UTC')
        all_open_attendances = self.search([
            ('check_out', '=', False),
            ('employee_id.company_id', 'any', [
                ('auto_check_out', '=', True),
                ('auto_check_out_mode', '=', 'specific_time'),
            ]),
        ])

        for company, company_attendances in all_open_attendances.grouped(lambda att: att.employee_id.company_id).items():
            cutoff_time = float_to_time(company.auto_check_out_specific_time)
            cutoff_hour, cutoff_minute = cutoff_time.hour, cutoff_time.minute
            for att in company_attendances:
                employee_tz = ZoneInfo(att.employee_id._get_tz())
                current_employee_dt = current_utc_dt.astimezone(employee_tz)
                check_in_employee_dt = att.check_in.astimezone(employee_tz)
                same_day_cutoff_dt = check_in_employee_dt.replace(
                    hour=cutoff_hour, minute=cutoff_minute, second=0, microsecond=0,
                )

                if check_in_employee_dt.time() < same_day_cutoff_dt.time():
                    next_cutoff = same_day_cutoff_dt
                else:
                    next_cutoff = same_day_cutoff_dt + relativedelta(days=1)

                if current_employee_dt < next_cutoff:
                    continue

                employee_checkout = next_cutoff.astimezone(utc_tz).replace(tzinfo=None)
                employee_checkout = max(employee_checkout, att.check_in + relativedelta(seconds=1))

                att.write({
                    'check_out': employee_checkout,
                    'out_mode': 'auto_check_out',
                })

                att.message_post(body=self.env._(
                    'This attendance was automatically checked out based on company specific time configuration.',
                ))

    def _get_localized_times(self):
        self.ensure_one()
        tz = ZoneInfo(self.employee_id.sudo()._get_version(self.check_in.date()).tz)
        localized_start = self.check_in.replace(tzinfo=UTC).astimezone(tz).replace(tzinfo=None)
        localized_end = self.check_out.replace(tzinfo=UTC).astimezone(tz).replace(tzinfo=None)
        return localized_start, localized_end

    def _get_break_duration_within_period(self, start, stop):
        attendances = self.filtered(lambda attendance: attendance.check_out and attendance.break_duration)
        if not attendances:
            return 0.0

        attendance_intervals = Intervals([
            (*attendance._get_localized_times(), attendance)
            for attendance in attendances
        ], keep_distinct=True)
        period_interval = Intervals([(start, stop, self.env['resource.calendar'])])
        break_duration = 0.0
        for start, stop, attendance in attendance_intervals & period_interval:
            attendance_duration = time_to_float(attendance.check_out - attendance.check_in)
            break_duration += (
                time_to_float(stop - start) / attendance_duration
            ) * attendance.break_duration
        return break_duration

    def init(self):
        super().init()
        self.env.cr.execute("""
            CREATE INDEX IF NOT EXISTS hr_attendance_check_in_check_out_employee_id
            ON hr_attendance (check_in, check_out, employee_id);
        """)

    def _apply_record_output(self, rules, excess, deficit, active_iv=None):
        rules._apply_attendance_output(excess, deficit, active_iv=active_iv)

    def _get_time_rule_deficit_occupied(self, employee_id, start_utc, period_end_utc):
        dummy = self.env['resource.calendar']
        existing = self.env['hr.attendance'].sudo().search([
            ('employee_id', '=', employee_id),
            ('check_in', '<', period_end_utc),
            ('check_out', '>', start_utc),
        ])
        return Intervals([(a.check_in, a.check_out, dummy) for a in existing], keep_distinct=True)

    def _get_time_rule_output_vals(self, rule, df, dt, pp):
        return rule._get_output_attendance_vals(self.employee_id, df, dt, self, accumulated_pp=pp)

    def _get_time_rule_remainder_vals(self, df, dt):
        return {
            'employee_id': self.employee_id.id,
            'check_in': df,
            'check_out': dt,
            'source_attendance_id': self.id,
        }

    def _get_source_extra_fields_domain(self):
        return [('state', '=', 'validated')]

    def _get_time_rule_break_hours(self):
        return self.break_duration or 0.0

    def _get_write_source_extra_source_fields(self):
        return {'work_entry_type_id', 'state', 'break_duration'}

    def _update_tolerance_state(self):
        to_validate = self.browse()
        candidates = self.filtered(lambda a: a.state == 'draft' and a.check_out and not a.time_rule_id)
        for att in candidates:
            company = att.employee_id.company_id or self.env.company
            if company.attendance_validation != 'review_conflicts':
                continue
            tz = ZoneInfo(att.employee_id._get_tz())
            day = att.check_in.replace(tzinfo=UTC).astimezone(tz).date()
            # sudo: the schedule is read from the employee contracts
            expected = sum_intervals(att.sudo().employee_id._get_expected_attendances(
                datetime.combine(day, time.min, tz),
                datetime.combine(day, time.max, tz),
            ))
            worked = (att.check_out - att.check_in).total_seconds() / 3600
            if not expected or abs(worked - expected) * 60 <= company.attendance_validation_tolerance:
                to_validate |= att
        if to_validate:
            # sudo: the tolerance check reviews the attendance, whoever recorded it
            to_validate.sudo().with_context(skip_time_rules=True, tracking_disable=True).write({'state': 'validated'})
        return to_validate

    def _is_review_exception(self):
        """ Whether this reviewed attendance is an exception to review anyway
        when only reviewing exceptions: late check in/out or overtime. """
        self.ensure_one()
        if self.is_late_check_in or self.is_early_check_out:
            return True
        # sudo: the schedule is read from the employee contracts
        employee = self.sudo().employee_id
        tz = ZoneInfo(employee._get_tz())
        day_start = datetime.combine(self.date, time.min, tz)
        expected = sum_intervals(employee._get_expected_attendances(day_start, day_start + timedelta(days=1)))
        worked = sum(self.sudo().search([
            ('employee_id', '=', employee.id),
            ('date', '=', self.date),
            ('check_out', '!=', False),
            ('time_rule_id', '=', False),
            ('source_attendance_id', '=', False),
        ]).mapped('worked_hours'))
        return (worked - expected) * 60 > employee.company_id.attendance_validation_tolerance

    def _review_exceptions(self):
        """ Send the exceptions among these reviewed attendances back to review. """
        exceptions = self.filtered(lambda a:
            a.state == 'validated'
            and a.check_out
            and not a.time_rule_id
            and not a.source_attendance_id
            and a.employee_id.company_id.attendance_validation == 'review_conflicts'
            and a._is_review_exception()
        )
        if exceptions:
            # sudo: the exceptions are put back to review, whoever recorded them
            exceptions.sudo().write({'state': 'draft'})

    def _get_initial_state(self, vals):
        if vals.get('time_rule_id') or vals.get('source_attendance_id'):
            # system-generated outputs always auto-validate
            return 'validated'
        if vals.get('in_mode') in self._AUTOMATIC_MODES:
            # checked in from the systray, the kiosk...: only reviewed when reviewing everything
            company = self.env.company
            if vals.get('employee_id'):
                company = self.env['hr.employee'].sudo().browse(vals['employee_id']).company_id or company
            return 'draft' if company.attendance_validation == 'review_all' else 'validated'
        if self._is_attendance_reviewer():
            # recorded manually by an officer: considered as reviewed
            return 'validated'
        # recorded manually by the employee: a conflict to review
        return 'draft'

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('check_out') and not vals.get('out_mode'):
                vals['out_mode'] = 'manual'
            if 'state' not in vals:
                vals['state'] = self._get_initial_state(vals)
            elif vals['state'] in ('validated', 'refused') and not self._is_attendance_reviewer() \
                    and not (vals.get('time_rule_id') or vals.get('source_attendance_id')):
                raise AccessError(_("Only attendance officers can review attendances."))
        res = super().create(vals_list)
        res._recompute_schedule_flags()
        to_check = res._update_tolerance_state()
        to_check |= res.filtered(lambda a: a.in_mode in ('systray', 'kiosk'))
        to_check._review_exceptions()
        return res

    def action_validate(self):
        self.write({'state': 'validated'})

    def action_refuse(self):
        self.write({'state': 'refused'})

    def action_reset_to_draft(self):
        self.write({'state': 'draft'})

    def get_record_default_action(self, access_uid=None):
        """This method redirects to the suitable employee view in action menuitem according to the user access rights"""
        res = {}
        if self.env.user.has_group('hr.group_hr_user'):
            res.update({
                'name': self.env._('Employees'),
                'type': 'ir.actions.act_window',
                'res_model': 'hr.employee',
                'view_mode': 'kanban, form',
                'views': [[False, 'kanban'], [False, 'form']],
            })

        else:
            res.update({
                'name': self.env._('Employees'),
                'type': 'ir.actions.act_window',
                'res_model': 'hr.employee.public',
                'view_mode': 'kanban,form',
                'views': [[False, 'kanban'], [False, 'form']],
            })
        return res

    @api.model
    def get_unusual_days(self, date_from, date_to=None):
        employee_id = self.env.context.get('employee_id', False)
        employee = self.env['hr.employee'].browse(employee_id) if employee_id else self.env.user.employee_id
        return employee.sudo(False)._get_unusual_days(date_from, date_to)
