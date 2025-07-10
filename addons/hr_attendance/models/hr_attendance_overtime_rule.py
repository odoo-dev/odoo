# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields, api
from odoo.exceptions import ValidationError

WEEKDAY_SELECTION = [
    ('0', 'Monday'),
    ('1', 'Tuesday'),
    ('2', 'Wednesday'),
    ('3', 'Thursday'),
    ('4', 'Friday'),
    ('5', 'Saturday'),
    ('6', 'Sunday'),
]

class HrAttendanceRule(models.Model):
    """
    Defines a specific rule for calculating overtime within a ruleset.
    Rules are evaluated in sequence order.
    """
    _name = 'hr.attendance.rule'
    _description = "Attendance Rule"
    _order = 'sequence'

    name = fields.Char(
        required=True,
        translate=True,
    )
    ruleset_id = fields.Many2one(
        comodel_name='hr.attendance.ruleset',
        required=True,
        ondelete='cascade',
    )
    sequence = fields.Integer(
        default=10,
    )
    active = fields.Boolean(
        default=True,
    )

    condition_type = fields.Selection(
        selection=[
            ('daily_threshold', 'Exceeds Daily Hours'),
            ('weekly_threshold', 'Exceeds Weekly Hours'),
            ('time_range', 'Within Specific Time Range'),
            # ('worked_on_day', 'Worked on Specific Day(s)'), # Covered by applicable_days below
        ],
        string="Condition Type",
        required=True,
        default='daily_threshold',
        help="The primary condition that triggers this rule."
    )

    threshold_hours = fields.Float(
        string="Threshold Hours",
        digits='Payroll',
        help="The number of hours after which this rule applies (e.g., 8 for daily, 40 for weekly)."
    )

    apply_monday = fields.Boolean("Mon", default=True)
    apply_tuesday = fields.Boolean("Tue", default=True)
    apply_wednesday = fields.Boolean("Wed", default=True)
    apply_thursday = fields.Boolean("Thu", default=True)
    apply_friday = fields.Boolean("Fri", default=True)
    apply_saturday = fields.Boolean("Sat")
    apply_sunday = fields.Boolean("Sun")

    apply_on_holidays = fields.Boolean(
        string="Apply on Public Holidays",
        help="Does this rule specifically apply (or only apply) to time worked during public holidays?"
    )

    time_from = fields.Float(
        string="From Time",
        digits=(2, 2),
    )
    time_to = fields.Float(
        string="To Time",
        digits=(2, 2),
        help="Specify an end time (0-24) for the rule to apply. Can span across midnight (e.g., From 22.0 To 6.0)."
    )

    compensation_type = fields.Selection(
        selection=[
            ('pay', 'Salary Rate'),
            ('time_off', 'Time Off Allocation')
        ],
        string="Compensation Type",
        required=True,
        default='pay',
        help="How is the overtime compensated?"
    )

    pay_rate_multiplier = fields.Float(
        string="Salary Rate Multiplier",
        digits=(16, 4),
        default=1.0,
        help="Multiplier for the employee's standard hourly rate (e.g., 1.5 for 150%, 2.0 for 200%)."
    )

    time_off_allocation_rate = fields.Float(
        string="Time Off Allocation Rate",
        digits=(16, 4),
        default=1.0,
        help="Multiplier for allocating time off (e.g., 1.0 means 1 hour OT = 1 hour Time Off, 1.5 means 1 hour OT = 1.5 hours Time Off)."
    )

    company_id = fields.Many2one(related='ruleset_id.company_id', store=True)
    country_id = fields.Many2one(related='ruleset_id.country_id', store=True)

    # --- Constraints ---
    @api.constrains('time_from', 'time_to')
    def _check_time_range(self):
        for rule in self:
            if rule.time_from is not None and (rule.time_from < 0 or rule.time_from > 24):
                raise ValidationError("From Time must be between 0 and 24.")
            if rule.time_to is not None and (rule.time_to < 0 or rule.time_to > 24):
                raise ValidationError("To Time must be between 0 and 24.")

    @api.constrains('threshold_hours', 'condition_type')
    def _check_threshold(self):
        for rule in self:
            if rule.condition_type in ('daily_threshold', 'weekly_threshold') and rule.threshold_hours <= 0:
                raise ValidationError("Threshold Hours must be positive for daily or weekly threshold conditions.")

    @api.constrains('pay_rate_multiplier', 'compensation_type')
    def _check_pay_rate(self):
        for rule in self:
            if rule.compensation_type == 'pay' and rule.pay_rate_multiplier <= 0:
                raise ValidationError("Salary Rate Multiplier must be positive when compensation type is Salary.")

    @api.constrains('time_off_allocation_rate', 'compensation_type')
    def _check_time_off_rate(self):
        for rule in self:
            if rule.compensation_type == 'time_off' and rule.time_off_allocation_rate <= 0:
                raise ValidationError("Time Off Allocation Rate must be positive when compensation type is Time Off.")

    # --- Helper methods (Example structure, actual implementation depends on engine) ---
    def _applies_to_datetime(self, check_datetime, is_holiday):
        """ Checks if this rule's time constraints match the given datetime """
        self.ensure_one()

        # Check public holiday
        if self.apply_on_holidays and not is_holiday:
            return False

        weekday = check_datetime.weekday()
        weekday_map = {
            0: self.apply_monday, 1: self.apply_tuesday, 2: self.apply_wednesday,
            3: self.apply_thursday, 4: self.apply_friday, 5: self.apply_saturday,
            6: self.apply_sunday
        }
        if not weekday_map.get(weekday, False):
            return False

        if self.time_from is not None and self.time_to is not None:
            time_float = check_datetime.hour + check_datetime.minute / 60.0
            time_from = self.time_from
            time_to = self.time_to

            if time_from <= time_to:
                if not (time_from <= time_float < time_to):
                    return False
            else:
                if not (time_float >= time_from or time_float < time_to):
                    return False

        return True