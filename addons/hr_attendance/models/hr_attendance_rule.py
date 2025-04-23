# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields

class HrAttendanceRuleset(models.Model):
    """
    Defines a set of attendance rules that can be applied, typically
    grouped by company or country regulations.
    """
    _name = 'hr.attendance.ruleset'
    _description = "Attendance Ruleset"
    _order = 'sequence, id'

    name = fields.Char(
        string="Ruleset Name",
        required=True,
        help="A descriptive name for this set of rules (e.g., 'Belgian Standard Overtime', 'US Weekly Overtime')."
    )
    company_id = fields.Many2one(
        comodel_name='res.company',
        required=True,
        default=lambda self: self.env.company,
        help="The company these rules apply to."
    )

    country_id = fields.Many2one(
        'res.country',
        string="Country",
        help="Optional: The country these rules are primarily associated with."
    )
    active = fields.Boolean(
        default=True,
        help="If unchecked, this ruleset and its rules will not be considered."
    )
    sequence = fields.Integer(
        default=10,
        help="Sequence for ordering rulesets, though often only one applies per employee."
    )

    rule_ids = fields.One2many(
        comodel_name='hr.attendance.rule',
        inverse_name='ruleset_id',
        string="Attendance Rules",
        help="The specific rules that define overtime calculation within this ruleset."
    )
