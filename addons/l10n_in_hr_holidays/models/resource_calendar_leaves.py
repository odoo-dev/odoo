# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime, time, UTC
from zoneinfo import ZoneInfo

from odoo import api, fields, models
from odoo.fields import Domain


class ResourceCalendarLeaves(models.Model):
    _inherit = 'resource.calendar.leaves'

    is_exceptional_days = fields.Boolean("Is Exceptional Day")
    working_start_date = fields.Date("Compensatory Off Start Date")
    working_end_date = fields.Date(
        "Compensatory Off End Date",
    )

    # @api.depends('working_start_date')
    # def _compute_working_end_date(self):
    #     # Mirrors the base model's `_compute_date_to`: a single-day pick only fills
    #     # `working_start_date` (e.g. via the daterange widget), so default the end
    #     # date to the start date instead of silently leaving it empty.
    #     for leave in self:
    #         if not leave.working_start_date or (leave.working_end_date and leave.working_end_date >= leave.working_start_date):
    #             continue
    #         leave.working_end_date = leave.working_start_date

    def _l10n_in_get_exceptional_day_bounds(self):
        self.ensure_one()
        tz = ZoneInfo(self.company_id.tz or self.env.company.tz or 'UTC')
        date_from = datetime.combine(self.working_start_date, time.min, tzinfo=tz)
        date_to = datetime.combine(self.working_end_date, time.max, tzinfo=tz)
        return (
            date_from.astimezone(UTC).replace(tzinfo=None),
            date_to.astimezone(UTC).replace(tzinfo=None),
        )

    def _l10n_in_sync_exceptional_days(self):
        for leave in self:
            if not (leave.is_exceptional_days and leave.working_start_date and leave.working_end_date):
                continue
            date_from, date_to = leave._l10n_in_get_exceptional_day_bounds()
            vals = {}
            if leave.date_from != date_from:
                vals['date_from'] = date_from
            if leave.date_to != date_to:
                vals['date_to'] = date_to
            if leave.count_as != 'working_time':
                vals['count_as'] = 'working_time'
            if vals:
                super(ResourceCalendarLeaves, leave).write(vals)

    # @api.onchange('is_exceptional_days', 'working_start_date', 'working_end_date')
    # def _onchange_exceptional_days(self):
    #     if self.is_exceptional_days and self.working_start_date and self.working_end_date:
    #         date_from, date_to = self._l10n_in_get_exceptional_day_bounds()
    #         self.date_from = date_from
    #         self.date_to = date_to
    #         self.count_as = 'working_time'

    # @api.model_create_multi
    # def create(self, vals_list):
    #     records = super().create(vals_list)
    #     records._l10n_in_sync_exceptional_days()
    #     return records

    # def write(self, vals):
    #     res = super().write(vals)
    #     if {'is_exceptional_days', 'working_start_date', 'working_end_date'} & vals.keys():
    #         self._l10n_in_sync_exceptional_days()
    #     return res

    @api.model
    def _l10n_in_get_exceptional_days_domain(self, date_from, date_to, company=None, calendar=None):
        domain = Domain([
            ('is_exceptional_days', '=', True),
            ('working_start_date', '<=', date_to),
            ('working_end_date', '>=', date_from),
        ])
        if company:
            domain &= Domain('company_id', 'in', [company.id, False])
        if calendar:
            domain &= Domain.OR([
                Domain('calendar_id', '=', False),
                Domain('calendar_id', '=', calendar.id),
            ])
        return domain