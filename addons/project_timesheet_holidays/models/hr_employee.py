# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models

class Employee(models.Model):
    _inherit = 'hr.employee'

    @api.model
    def create(self, vals):
        result = super(Employee, self).create(vals)

        # We need to create timesheet entries for the global time off that are already created
        # and are planned for after this employee creation date

        # First we look for the global time off that are already planned after today
        global_leaves = self.env['resource.calendar.leaves'].search([
            ('date_from', '>=', fields.Date.today()),
            ('id', 'in', result.resource_calendar_id.global_leave_ids.ids)])
        vals_list = []

        # For each of them we create the corresponding timesheet entries for the employee
        for global_time_off in global_leaves:
            work_hours_data = global_time_off._work_time_per_day()
            for index, (day_date, work_hours_count) in enumerate(work_hours_data):
                vals_list.append(global_time_off._timesheet_prepare_line_values(index, result, work_hours_data, day_date, work_hours_count))
        self.env['account.analytic.line'].sudo().create(vals_list)
        return result
