# Part of Odoo. See LICENSE file for full copyright and licensing details.

from collections import defaultdict
from dateutil.relativedelta import relativedelta

from odoo import api, fields, models

from odoo.addons.hr_holidays.models.hr_leave import LEAVE_STATE


class HrWorkEntry(models.Model):
    _inherit = 'hr.work.entry'

    leave_ids = fields.Many2many('hr.leave', string='Time Off')
    leave_state = fields.Selection(LEAVE_STATE, compute='_compute_leave_state')

    @api.depends('leave_ids.state')
    def _compute_leave_state(self):
        for entry in self:
            if entry.leave_ids:
                entry.leave_state = entry.leave_ids[0].state
            else:
                entry.leave_state = 'confirm'

    def write(self, vals):
        if 'state' in vals and vals['state'] == 'cancelled':
            self.mapped('leave_ids').filtered(lambda l: l.state != 'refuse').action_refuse()
        return super().write(vals)

    def _reset_conflicting_state(self):
        super()._reset_conflicting_state()
        attendances = self.filtered(lambda w: w.work_entry_type_id and w.work_entry_type_id.category == 'working_time')
        attendances.write({'leave_ids': False})

    def action_approve_leave(self):
        self.ensure_one()
        for leave in self.leave_ids:
            leave.action_approve()

    def action_refuse_leave(self):
        self.ensure_one()
        leaves_sudo = self.leave_ids.sudo()
        for leave in leaves_sudo:
            leave.action_refuse()

    @api.model
    def _get_leaves_duration_between_two_dates(self, employee_id, date_from, date_to):
        date_from += relativedelta(hour=0, minute=0, second=0)
        date_to += relativedelta(hour=23, minute=59, second=59)
        leaves_work_entries = self.env['hr.work.entry'].search([
            ('employee_id', '=', employee_id.id),
            ('date', '>=', date_from),
            ('date', '<=', date_to),
            ('state', '!=', 'cancelled'),
            ('leave_ids', '!=', False),
            ('leave_state', '=', 'validate'),
        ])
        entries_by_leave_type = defaultdict(lambda: self.env['hr.work.entry'])
        for work_entry in leaves_work_entries:
            for leave_id in work_entry.leave_ids:
                entries_by_leave_type[leave_id.holiday_status_id] |= work_entry

        durations_by_leave_type = {}
        for leave_type, work_entries in entries_by_leave_type.items():
            durations_by_leave_type[leave_type] = sum(work_entries.mapped('duration'))
        return durations_by_leave_type

    @api.model
    def get_work_entry_sources_fields_names(self):
        return super().get_work_entry_sources_fields_names() + ['leave_ids']

    def recompute_duration_from_sources(self):
        for entry in self:
            if entry.category == 'absence':
                entry.duration = sum(leave.number_of_hours for leave in entry.leave_ids)
            else:
                super().recompute_duration_from_sources()


class HrWorkEntryType(models.Model):
    _inherit = 'hr.work.entry.type'
    _description = 'HR Work Entry Type'

    leave_type_ids = fields.One2many(
        'hr.leave.type', 'work_entry_type_id', string='Time Off Type',
        help="Work entry used in the payslip.")
