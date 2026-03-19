# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime, time

from dateutil.relativedelta import relativedelta

from odoo import api, fields, models
from odoo.exceptions import ValidationError
from odoo.fields import Domain


class ResourcePublicHoliday(models.Model):
    _inherit = 'resource.public.holiday'

    def _default_work_entry_type_id(self):
        # To be overriden in l10ns
        return False

    work_location_ids = fields.Many2many('hr.work.location')
    work_entry_type_id = fields.Many2one(comodel_name='hr.work.entry.type', default=_default_work_entry_type_id)

    def _get_time_domain(self):
        return Domain.OR(
            [
                ('employee_company_id', '=', record.company_id.id),
                ('date_to', '>', datetime.combine(record.date, time.min) + relativedelta(days=-1)),
                ('date_from', '<', datetime.combine(record.date, time.max) + relativedelta(days=1)),
            ] for record in self
        )

    @api.model_create_multi
    def create(self, vals_list):
        res = super().create(vals_list)
        time_domain = res._get_time_domain()
        self._reevaluate_leaves(time_domain)
        return res

    def write(self, vals):
        time_domain = self._get_time_domain()
        res = super().write(vals)
        time_domain = Domain.AND([time_domain, self._get_time_domain()])
        self._reevaluate_leaves(time_domain)

        return res

    def unlink(self):
        time_domain = self._get_time_domain()
        res = super().unlink()
        self._reevaluate_leaves(time_domain)

        return res

    def _get_work_entry_type(self):
        work_entry_type_per_ph = {}
        work_entry_type_per_country_code = {
            'AE': 'hr_work_entry.uae_public_holiday_entry_type',
            'BE': 'hr_work_entry.l10n_be_work_entry_type_bank_holiday',
            'CH': 'hr_work_entry.l10n_ch_work_entry_type_bank_holiday',
            'HK': 'hr_work_entry.l10n_hk_work_entry_type_public_holiday',
            'ID': 'hr_work_entry.l10n_id_work_entry_type_public_holiday',
        }
        for public_holiday in self:
            country = public_holiday.country_id or public_holiday.company_id.country_id or self.env.company_id.country_id
            if country.code in work_entry_type_per_country_code:
                work_entry_type_per_ph[public_holiday] = self.env.ref
            work_entry_type_per_ph[public_holiday] = self.env['hr.work.entry.type']

    def _reevaluate_leaves(self, time_domain):
        if not time_domain:
            return

        leaves = self.env['hr.leave'].search(time_domain & Domain('state', 'not in', ['refuse', 'cancel']))
        if not leaves:
            return

        previous_durations = leaves.mapped('number_of_days')
        previous_states = leaves.mapped('state')
        self.env.add_to_compute(self.env['hr.leave']._fields['number_of_days'], leaves)
        self.env.add_to_compute(self.env['hr.leave']._fields['duration_display'], leaves)
        leaves.sudo().write({
            'state': 'confirm',
        })
        sick_time_status = self.env['hr.work.entry.type'].search([('code', '=', 'LEAVE110')])
        leaves_to_recreate = self.env['hr.leave']
        for previous_duration, leave, state in zip(previous_durations, leaves, previous_states):
            duration_difference = previous_duration - leave.number_of_days
            message = False
            if duration_difference > 0 and leave.work_entry_type_id.requires_allocation:
                message = self.env._("Due to a change in global time offs, you have been granted %s day(s) back.", duration_difference)
            if leave.number_of_days > previous_duration\
                    and (not sick_time_status or leave.work_entry_type_id not in sick_time_status):
                message = self.env._("Due to a change in global time offs, %s extra day(s) have been taken from your allocation. Please review this leave if you need it to be changed.", -1 * duration_difference)
            try:
                leave.sudo().write({'state': state})  # sudo in order to skip _check_approval_update
                leave._check_validity()
                if leave.state == 'validate':
                    # recreate the resource leave that were removed by writing state to draft
                    leaves_to_recreate |= leave
            except ValidationError:
                leave.action_refuse()
                message = self.env._("Due to a change in global time offs, this leave no longer has the required amount of available allocation and has been set to refused. Please review this leave.")
            if message:
                leave._notify_change(message)
        leaves_to_recreate.sudo()._create_resource_leave()

    def load_public_holidays(self):
        return {
            'type': 'ir.actions.act_window',
            'name': self.env._('Load Public Holidays'),
            'res_model': 'load.public.holiday.wizard',
            'view_mode': 'form',
            'target': 'new',
        }
