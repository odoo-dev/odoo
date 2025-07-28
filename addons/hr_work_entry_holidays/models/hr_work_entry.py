# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class HrWorkEntry(models.Model):
    _inherit = 'hr.work.entry'

    leave_id = fields.Many2one('hr.leave', string='Time Off')
    leave_state = fields.Selection(related='leave_id.state')

    def _is_duration_computed_from_calendar(self):
        return super()._is_duration_computed_from_calendar() or bool(not self.work_entry_type_id and self.leave_id)

    def write(self, vals):
        if 'state' in vals and vals['state'] == 'cancelled':
            self.mapped('leave_id').filtered(lambda l: l.state != 'refuse').action_refuse()
        return super().write(vals)

    def _reset_conflicting_state(self):
        super()._reset_conflicting_state()
        attendances = self.filtered(lambda w: w.work_entry_type_id and not w.work_entry_type_id.is_leave)
        if attendances and attendances.leave_id:
            ic()
            ic(attendances, attendances.leave_id.name)
        attendances.write({'leave_id': False})

    def _check_if_error(self):
        res = super()._check_if_error()
        conflict_with_leaves = self._compute_conflicts_leaves_to_approve()
        return res or conflict_with_leaves

    def _compute_conflicts_leaves_to_approve(self):
        if not self:
            return False

        self.flush_recordset(['date_start', 'date_stop', 'employee_id', 'active'])
        self.env['hr.leave'].flush_model(['date_from', 'date_to', 'state', 'employee_id'])
        self.env.cr.execute("""
            SELECT
                work_entry.id AS work_entry_id,
                leave.id AS leave_id
            FROM hr_work_entry AS work_entry
            INNER JOIN hr_leave leave ON work_entry.employee_id = leave.employee_id
            WHERE
                work_entry.active AND
                work_entry.id IN %s AND
                -- leave contains work_entry
                leave.date_from < work_entry.date_stop AND
                leave.date_to > work_entry.date_start AND
                leave.state IN ('confirm', 'validate1');
        """, [tuple(self.ids)])
        conflicts = self.env.cr.dictfetchall()
        for res in conflicts:
            # TODO: BIB This is the code erasing the leave from the initial lines
            self.browse(res.get('work_entry_id')).write({
                'state': 'conflict',
                'leave_id': res.get('leave_id')
            })
        return bool(conflicts)

    def action_approve_leave(self):
        self.ensure_one()
        if self.leave_id:
            # Already confirmed once
            if self.leave_id.state == 'validate1':
                self.leave_id.action_validate()
            # Still in confirmed state
            else:
                self.leave_id.action_approve()
                # If double validation, still have to validate it again
                if self.leave_id.validation_type == 'both':
                    self.leave_id.action_validate()

    def action_refuse_leave(self):
        self.ensure_one()
        leave_sudo = self.leave_id.sudo()
        if leave_sudo:
            leave_sudo.action_refuse()


class HrWorkEntryType(models.Model):
    _inherit = 'hr.work.entry.type'
    _description = 'HR Work Entry Type'

    leave_type_ids = fields.One2many(
        'hr.leave.type', 'work_entry_type_id', string='Time Off Type',
        help="Work entry used in the payslip.")
