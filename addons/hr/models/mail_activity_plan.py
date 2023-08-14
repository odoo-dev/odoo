# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _
from odoo.exceptions import UserError


class MailActivityPlan(models.Model):
    _inherit = 'mail.activity.plan'

    department_id = fields.Many2one('hr.department', check_company=True, ondelete='cascade')

    @api.constrains('res_model')
    def _check_compatibility_with_model(self):
        """ Check that when the model is updated to a model different from employee,
        there are no remaining specific values to employee. """
        template_ids_to_check = set()
        error_department = False
        for plan in self.filtered(lambda plan: plan.res_model != 'hr.employee'):
            template_ids_to_check.update(plan.template_ids.ids)
            if plan.department_id:
                error_department = True
        errors = [_('Department can only be set with employee plan.')] if error_department else []
        if template_ids_to_check and self.env['mail.activity.plan.template'].search(
                [('id', 'in', tuple(template_ids_to_check)),
                 ('responsible_type', 'in', ('coach', 'manager', 'employee'))], limit=1):
            errors.append('Coach, manager or employee can only be chosen as template responsible with employee plan.')
        if errors:
            raise UserError('\n'.join(errors))

    @api.onchange('res_model')
    def _onchange_res_model(self):
        if self.res_model != 'hr.employee':
            self.department_id = False
