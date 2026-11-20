# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _
from odoo.addons.base.models.res_partner import _tz_get
from odoo.modules.db import country_timezones as _country_timezones


class ResCompany(models.Model):
    _inherit = 'res.company'

    resource_calendar_ids = fields.One2many(
        'resource.calendar', 'company_id', 'Working Hours')
    resource_calendar_id = fields.Many2one(
        'resource.calendar', 'Default Working Hours', ondelete='restrict')
    tz = fields.Selection(
        _tz_get, string='Timezone',
        compute='_compute_tz', store=True, readonly=False)
    tz_outside_country = fields.Boolean(compute='_compute_tz_outside_country')

    @api.depends('country_id')
    def _compute_tz(self):
        country_tz = _country_timezones()
        for company in self:
            company.tz = self.env.context.get('tz') or self.env.user.tz or 'UTC'
            if company.country_id:
                country_timezones = country_tz.get(company.country_id.code, [])
                if len(country_timezones) == 1:
                    company.tz = country_timezones[0]

    @api.depends('tz', 'country_id')
    def _compute_tz_outside_country(self):
        country_tz = _country_timezones()
        for company in self:
            company.tz_outside_country = bool(company.country_id) and company.tz not in country_tz.get(company.country_id.code, [])

    @api.model
    def _init_data_resource_calendar(self):
        self.search([('resource_calendar_id', '=', False)])._create_resource_calendar()

    def _create_resource_calendar(self):
        """ Create a default working schedule for each company of ``self`` and set it as
        their ``resource_calendar_id``. """
        vals_list = [
            company._prepare_resource_calendar_values()
            for company in self
        ]
        resource_calendars = self.env['resource.calendar'].create(vals_list)
        for company, calendar in zip(self, resource_calendars):
            company.resource_calendar_id = calendar

    def _prepare_resource_calendar_values(self):
        """ Hook returning the creation values of the company's default working schedule
        (40 hours/week by default). """
        self.ensure_one()
        return {
            'name': _('40 hours/week'),
            'company_id': self.id,
        }

    @api.model_create_multi
    def create(self, vals_list):
        companies = super().create(vals_list)
        companies_without_calendar = companies.filtered(lambda c: not c.resource_calendar_id)
        if companies_without_calendar:
            companies_without_calendar.sudo()._create_resource_calendar()
        # calendar created from form view: no company_id set because record was still not created
        for company in companies:
            if not company.resource_calendar_id.company_id:
                company.resource_calendar_id.company_id = company.id
        return companies

    def _get_company_tz(self):
        """ Timezone in which the company dates its documents: its own if it
        is one of its country's, else the user's, else UTC.

        A timezone outside the country is not trusted: in countries with
        several timezones, it is the one of the user who created the company
        (or its working schedule), not a choice.
        """
        self.ensure_one()
        if self.tz and not self.tz_outside_country:
            return self.tz
        return self.env.context.get('tz') or self.env.user.tz or 'UTC'

    def _get_company_today(self, timestamp=None):
        """ Date of the company (see :meth:`_get_company_tz`) today, or at
        the given UTC ``timestamp``.
        """
        return fields.Date.context_today(self.with_context(tz=self._get_company_tz()), timestamp)
