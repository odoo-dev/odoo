from odoo import models, fields, api, _
from odoo.tools import float_compare

class HrAttendanceAnalysisLine(models.Model):
    """
    Stores the analysis results of attendance records based on applied rules.
    Each line represents a segment of time from an attendance record,
    classified according to a specific attendance rule.
    """
    _name = 'hr.attendance.analysis.line'
    _description = "Attendance Analysis Line"
    _order = "start_dt asc, id" # Order by time

    attendance_id = fields.Many2one(
        'hr.attendance',
        string="Attendance Record",
        required=True,
        ondelete='cascade',
        index=True
    )
    employee_id = fields.Many2one(
        related='attendance_id.employee_id',
        store=True,
        index=True
    )
    company_id = fields.Many2one(
        related='attendance_id.employee_id.company_id',
        store=True,
        index=True
    )
    ruleset_id = fields.Many2one(
        'hr.attendance.ruleset',
        string="Applied Ruleset",
        related='rule_id.ruleset_id', # Assuming contract link
        store=False, # No need to store if fetched via contract
        readonly=True
    )
    rule_id = fields.Many2one(
        'hr.attendance.rule',
        string="Applied Rule",
        required=False, # Might be standard time not covered by a specific rule
        ondelete='restrict', # Don't delete rule if analysis lines exist
        help="The specific attendance rule that classified this time segment."
    )
    date = fields.Date(
        string="Date",
        required=True,
        index=True,
        help="The date (in employee's timezone) to which this analysis line applies."
    )
    start_dt = fields.Datetime(
        string="Start Datetime (UTC)",
        required=True,
        help="Start of the time segment classified by this line (in UTC)."
    )
    end_dt = fields.Datetime(
        string="End Datetime (UTC)",
        required=True,
        help="End of the time segment classified by this line (in UTC)."
    )
    duration = fields.Float(
        string="Duration (hours)",
        compute='_compute_duration',
        store=True,
        readonly=True,
        digits='Payroll', # Use appropriate precision
        help="Duration of this time segment in hours."
    )
    compensation_type = fields.Selection(
        related='rule_id.compensation_type',
        store=True,
        readonly=True
    )
    pay_rate_multiplier = fields.Float(
        related='rule_id.pay_rate_multiplier',
        string="Pay Rate Multiplier",
        store=True,
        readonly=True,
        digits=(16, 4)
    )
    time_off_allocation_rate = fields.Float(
        related='rule_id.time_off_allocation_rate',
        string="Time Off Allocation Rate",
        store=True,
        readonly=True,
        digits=(16, 4)
    )
    is_overtime = fields.Boolean(
        string="Is Overtime/Premium",
        compute='_compute_is_overtime',
        store=True,
        help="True if this time segment is considered overtime or premium time based on the applied rule."
    )
    # Optional: Add computed fields for payable hours or allocatable hours if needed directly here

    @api.depends('start_dt', 'end_dt')
    def _compute_duration(self):
        for line in self:
            if line.start_dt and line.end_dt:
                line.duration = (line.end_dt - line.start_dt).total_seconds() / 3600.0
            else:
                line.duration = 0.0

    @api.depends('rule_id', 'pay_rate_multiplier', 'time_off_allocation_rate', 'compensation_type')
    def _compute_is_overtime(self):
        # Determine if a line is considered overtime/premium
        # This logic might need refinement based on exact requirements
        # e.g., Is standard rate (multiplier=1) on a Sunday considered 'overtime/premium'?
        # For now, we consider anything compensated differently than standard pay as overtime/premium.
        std_rate_precision = self.env['decimal.precision'].precision_get('Payroll')
        for line in self:
            is_ot = False
            if line.rule_id:
                if line.compensation_type == 'pay':
                    # If pay rate is significantly different from 1.0
                    if float_compare(line.pay_rate_multiplier, 1.0, precision_digits=std_rate_precision) != 0:
                        is_ot = True
                elif line.compensation_type == 'time_off':
                    # If any time off is allocated
                    if float_compare(line.time_off_allocation_rate, 0.0, precision_digits=std_rate_precision) > 0:
                        is_ot = True
                # Add other conditions? e.g., rule type is specifically 'weekend'?
            line.is_overtime = is_ot

