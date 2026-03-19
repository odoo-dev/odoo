# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


TIME_TYPE_REF_PER_COUNTRY = {
    'AE': 'hr_work_entry.uae_public_holiday_entry_type',
    'BE': 'hr_work_entry.l10n_be_work_entry_type_bank_holiday',
    'CH': 'hr_work_entry.l10n_ch_work_entry_type_bank_holiday',
    'HK': 'hr_work_entry.l10n_hk_work_entry_type_public_holiday',
    'ID': 'hr_work_entry.l10n_id_work_entry_type_public_holiday',
}

class ResourceCalendarPublicHolidayWizardLine(models.TransientModel):
    _name = 'load.public.holiday.wizard.line'
    _description = 'Public Holiday Preview Wizard Line'
    _order = 'country_id, start_date, name'

    name = fields.Char(required=True)
    wizard_id = fields.Many2one('load.public.holiday.wizard', required=True, ondelete='cascade')
    start_date = fields.Date(required=True)
    country_id = fields.Many2one('res.country', required=True)
    work_entry_type_id = fields.Many2one('hr.work.entry.type', string="Work Entry Type",
        compute='_compute_work_entry_type', readonly=False, store=True,
        domain="[('id', 'in', allowed_work_entry_type_ids)]")
    allowed_work_entry_type_ids = fields.Many2many('hr.work.entry.type', compute='_compute_work_entry_type', store=True)

    @api.depends('country_id')
    def _compute_work_entry_type(self):
        for line in self:
            domain = [('country_id', '=', line.country_id.id)]
            line.allowed_work_entry_type_ids = self.env['hr.work.entry.type'].search(domain)
            if line.work_entry_type_id not in line.allowed_work_entry_type_ids:
                time_type_ref = TIME_TYPE_REF_PER_COUNTRY.get(line.country_id.code, False)
                line.work_entry_type_id = self.env.ref(time_type_ref) if time_type_ref else False
