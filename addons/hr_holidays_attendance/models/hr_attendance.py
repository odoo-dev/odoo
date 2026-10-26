# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models
from odoo.fields import Domain
from odoo.tools import SQL

# fields that when changed invalidate previously credited allocations
_TIME_FIELDS = frozenset({'check_in', 'check_out', 'employee_id'})

# states in which an attendance no longer counts as valid source material
_INVALID_STATES = frozenset({'refused', 'draft'})


class HrAttendance(models.Model):
    _inherit = 'hr.attendance'

    has_leave_conflict = fields.Boolean(
        string="Time Off Conflict", compute='_compute_has_leave_conflict', search='_search_has_leave_conflict',
        help="The attendance overlaps an approved time off of the employee.")

    def _leave_conflict_query(self):
        return SQL("""(
            SELECT attendance.id
              FROM hr_attendance attendance
              JOIN hr_leave leave
                ON leave.employee_id = attendance.employee_id
               AND leave.state = 'validate'
               AND leave.date_from < COALESCE(attendance.check_out, NOW() AT TIME ZONE 'UTC')
               AND leave.date_to > attendance.check_in
        )""")

    def _compute_has_leave_conflict(self):
        conflicts = self.search([('id', 'in', self.ids), ('has_leave_conflict', '=', True)]) if self.ids else self.browse()
        for attendance in self:
            attendance.has_leave_conflict = attendance in conflicts

    def _search_has_leave_conflict(self, operator, value):
        if operator != 'in':
            return NotImplemented
        if True in value and False in value:
            return Domain.TRUE
        return [('id', 'in' if True in value else 'not in', self._leave_conflict_query())]

    def _is_review_exception(self):
        return super()._is_review_exception() or self.has_leave_conflict

    @api.model
    def _get_dashboard_cards(self):
        return super()._get_dashboard_cards() + [
            {'filter': 'leave_conflict', 'label': self.env._("Conflicts"), 'color': 'cyan', 'domain': [('has_leave_conflict', '=', True)]},
        ]

    def write(self, vals):
        to_reverse = set()
        if not self.env.context.get('skip_time_rules') and _TIME_FIELDS & vals.keys():
            to_reverse.update(self.ids)
        if vals.get('state') in _INVALID_STATES:
            to_reverse.update(self.filtered(lambda a: a.state == 'validated').ids)
        if to_reverse:
            self.env['hr.time.rule']._reverse_allocation_credits('hr.attendance', to_reverse)
        return super().write(vals)

    @api.ondelete(at_uninstall=False)
    def _reverse_credits_on_unlink(self):
        self.env['hr.time.rule']._reverse_allocation_credits('hr.attendance', self.ids)
