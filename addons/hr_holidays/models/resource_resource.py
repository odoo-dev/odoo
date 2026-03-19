# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import UTC, date, datetime, time
from zoneinfo import ZoneInfo

from odoo import fields, models
from odoo.fields import Domain
from odoo.tools import babel_locale_parse
from odoo.tools.date_utils import weeknumber


class ResourceResource(models.Model):
    _inherit = "resource.resource"

    leave_date_to = fields.Date(related="user_id.leave_date_to")

    def _format_leave(self, leave, resource_hours_per_day, resource_hours_per_week, ranges_to_remove, start_day, end_day, locale):
        leave_start = leave[0]
        leave_record = leave[2]
        holiday_id = leave_record.holiday_id
        tz = ZoneInfo(self.tz or self.env.user.tz)

        if holiday_id.work_entry_type_request_unit == 'half_day':
            # Half day leaves are limited to half a day within a single day
            leave_day = leave_start.date()
            half_start_datetime = datetime.combine(leave_day, datetime.min.time() if holiday_id.request_date_from_period == "am" else time(12), tzinfo=tz)
            half_end_datetime = datetime.combine(leave_day, time(12) if holiday_id.request_date_from_period == "am" else datetime.max.time(), tzinfo=tz)
            ranges_to_remove.append((half_start_datetime, half_end_datetime, self.env['resource.calendar.attendance']))

            if not self._is_fully_flexible():
                # only days inside the original period
                if start_day <= leave_day <= end_day:
                    resource_hours_per_day[self.id][leave_day] -= holiday_id.number_of_hours
                week = weeknumber(babel_locale_parse(locale), leave_day)
                resource_hours_per_week[self.id][week] -= holiday_id.number_of_hours
        elif holiday_id.work_entry_type_request_unit == 'hour':
            # Custom leaves are limited to a specific number of hours within a single day
            leave_day = leave_start.date()
            range_start_datetime = leave_record.date_from.replace(tzinfo=UTC).astimezone(tz)
            range_end_datetime = leave_record.date_to.replace(tzinfo=UTC).astimezone(tz)
            ranges_to_remove.append((range_start_datetime, range_end_datetime, self.env['resource.calendar.attendance']))

            if not self._is_fully_flexible():
                # only days inside the original period
                if start_day <= leave_day <= end_day:
                    resource_hours_per_day[self.id][leave_day] -= holiday_id.number_of_hours
                week = weeknumber(babel_locale_parse(locale), leave_day)
                resource_hours_per_week[self.id][week] -= holiday_id.number_of_hours
        else:
            super()._format_leave(leave, resource_hours_per_day, resource_hours_per_week, ranges_to_remove, start_day, end_day, locale)

    def _get_ph_domain(self, target_date=date.today()):
        employee_resources = self.filtered('employee_id')
        other_resources = self - employee_resources
        global_domain = super(ResourceResource, other_resources)._get_ph_domain(target_date)
        for resource in employee_resources:
            valid_version_sudo = self.env['hr.version']
            if resource.employee_id:
                valid_version_sudo = resource.sudo().employee_id._get_version(target_date)
            domain = Domain([
                ('company_id', 'in', [False, resource.company_id.id]),
                ('calendar_ids', 'in', [False, resource.calendar_id.id]),
            ])
            if valid_version_sudo:
                work_location_sudo = valid_version_sudo.work_location_id
                address_sudo = work_location_sudo.address_id or valid_version_sudo.company_id.partner_id
                domain = Domain.AND([domain, Domain([
                    ('country_id', 'in', [False, address_sudo.country_id.id]),
                    ('state_ids', 'in', [False, address_sudo.state_id.id]),
                    ('work_location_ids', 'in', [False, work_location_sudo.id]),
                ])])
            global_domain = Domain.OR([global_domain, domain])
        return global_domain
