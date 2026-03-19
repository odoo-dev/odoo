# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models
from odoo.exceptions import ValidationError


class ResourcePublicHoliday(models.Model):
    _name = 'resource.public.holiday'
    _description = 'Public Holiday'
    _order = 'date, id'

    name = fields.Char(required=True)
    date = fields.Date(required=True, default=fields.Date.context_today)
    calendar_ids = fields.Many2one('resource.calendar')
    company_id = fields.Many2one('res.company', string="Company", readonly=True, store=True,
        default=lambda self: self.env.company, compute='_compute_company_id')
    state_ids = fields.Many2many('res.country.state')
    country_id = fields.Many2one('res.country', compute='_compute_country_id', readonly=False, store=True)

    @api.constrains('date', 'calendar_ids', 'company_id', 'country_id')
    def _check_exisiting(self):
        existing_holidays = self.env['resource.public.holiday']._read_group(
            domain=[
                ('company_id', 'in', [False] + self.company_id.ids),
                ('country_id', 'in', [False] + self.country_id.ids),
                ('date', '<=', max(self.mapped('date'))),
                ('date', '>=', min(self.mapped('date'))),
                ('state_ids', 'in', [False] + self.state_ids.ids),
                ('work_location_ids', 'in', [False] + self.work_location_ids.ids),
            ],
            groupby=['date:day', 'calendar_ids', 'company_id', 'country_id'],
            aggregates=['id:recordset'],
        )
        existing_holidays_dict = {
            (date, calendar_ids, company_id, country_id): holidays
            for date, calendar_ids, company_id, country_id, holidays
            in existing_holidays
        }
        for record in self:
            record_key = (record.date, record.calendar_ids, record.company_id, record.country_id)
            if existing_holidays_dict.get(record_key, self.env['resource.public.holiday']) - record:
                raise ValidationError(self.env._('Two public holidays cannot overlap each other.'))


    @api.depends('calendar_ids')
    def _compute_company_id(self):
        for holiday in self:
            holiday.company_id = holiday.calendar_ids.company_id or self.env.company

    @api.depends('state_ids')
    def _compute_country_id(self):
        for holiday in self:
            if not holiday.state_ids:
                continue
            holiday.country_id = False
            if len(holiday.state_ids.country_id) == 1:
                holiday.country_id = holiday.state_ids.country_id
