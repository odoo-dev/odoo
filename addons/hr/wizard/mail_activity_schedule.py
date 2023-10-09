# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models
from odoo.osv import expression


class MailActivitySchedule(models.TransientModel):
    _inherit = 'mail.activity.schedule'

    department_id = fields.Many2one('hr.department', compute='_compute_department_id')

    @api.depends('department_id')
    def _compute_available_plan_ids(self):
        return super()._compute_available_plan_ids()

    @api.depends('res_model_id', 'res_ids')
    def _compute_department_id(self):
        for wizard in self:
            if wizard.res_model == 'hr.employee':
                applied_on = wizard._get_applied_on_records()
                all_departments = applied_on.department_id
                wizard.department_id = False if len(all_departments) > 1 else all_departments
            else:
                wizard.department_id = False

    def _get_search_available_plan_domain(self):
        domain = super()._get_search_available_plan_domain()
        if self.res_model != 'hr.employee':
            return domain
        if not self.department_id:
            return expression.AND([domain, [('department_id', '=', False)]])
        return expression.AND([
            domain,
            expression.OR([[('department_id', '=', False)], [('department_id', '=', self.department_id.id)]])
        ])
