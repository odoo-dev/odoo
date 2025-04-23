# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields, api
from odoo.exceptions import ValidationError

# Define weekday selection globally or within the class
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
    _order = 'sequence, id' # Crucial for processing order

    name = fields.Char(
        required=True,
        translate=True, # If rule names need translation
        help="A clear name for the rule (e.g., 'Daily Overtime > 8h', 'Weekend Rate', 'Weekly Overtime > 40h')."
    )
    ruleset_id = fields.Many2one(
        comodel_name='hr.attendance.ruleset',
        required=True,
        ondelete='cascade', # If ruleset deleted, delete its rules
        help="The ruleset this rule belongs to."
    )
    sequence = fields.Integer(
        default=10,
        help="Determines the order of evaluation. Lower numbers are checked first. Crucial for handling overlapping conditions (e.g., daily vs weekly)."
    )
    active = fields.Boolean(
        default=True,
        help="If unchecked, this rule will be ignored."
    )

    # --- Condition Fields ---
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
        digits='Payroll', # Use appropriate precision
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
    # Add logic for "only apply on holidays" if needed, maybe another selection field.

    time_from = fields.Float(
        string="From Time",
        digits=(2, 2), # e.g., 18.5 for 6:30 PM
        help="Specify a start time (0-24) for the rule to apply (e.g., for night shifts, evening rates)."
    )
    time_to = fields.Float(
        string="To Time",
        digits=(2, 2), # e.g., 6.0 for 6:00 AM
        help="Specify an end time (0-24) for the rule to apply. Can span across midnight (e.g., From 22.0 To 6.0)."
    )

    # --- Outcome / Compensation Fields ---
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
        digits=(16, 4), # Allow precision like 1.5, 2.0 etc.
        default=1.0, # Default to normal rate, but usually > 1 for overtime
        help="Multiplier for the employee's standard hourly rate (e.g., 1.5 for 150%, 2.0 for 200%)."
    )

    time_off_allocation_rate = fields.Float(
        string="Time Off Allocation Rate",
        digits=(16, 4),
        default=1.0,
        help="Multiplier for allocating time off (e.g., 1.0 means 1 hour OT = 1 hour Time Off, 1.5 means 1 hour OT = 1.5 hours Time Off)."
    )

    # --- Related fields for context (optional but useful) ---
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
            # Can add check for from < to if not spanning midnight, but that depends on logic

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
        # Consider adding another flag 'only_on_holidays' if needed
        # if self.only_on_holidays and not is_holiday:
        #    return False
        # if not self.only_on_holidays and is_holiday and not self.apply_on_holidays: # If rule explicitly excludes holidays
        #    return False

        # Check weekday
        weekday = check_datetime.weekday() # Monday is 0, Sunday is 6
        weekday_map = {
            0: self.apply_monday, 1: self.apply_tuesday, 2: self.apply_wednesday,
            3: self.apply_thursday, 4: self.apply_friday, 5: self.apply_saturday,
            6: self.apply_sunday
        }
        if not weekday_map.get(weekday, False):
            return False

        # Check time range if specified
        if self.time_from is not None and self.time_to is not None:
            time_float = check_datetime.hour + check_datetime.minute / 60.0
            time_from = self.time_from
            time_to = self.time_to

            if time_from <= time_to: # Normal range (e.g., 9.0 to 17.0)
                if not (time_from <= time_float < time_to):
                    return False
            else: # Range spans midnight (e.g., 22.0 to 6.0)
                if not (time_float >= time_from or time_float < time_to):
                    return False

        return True # All time constraints met
