# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models, _


class MailActivityPLanTemplate(models.Model):
    _inherit = 'mail.activity.plan.template'

    responsible_type = fields.Selection(selection_add=[
        ('coach', 'Coach'),
        ('manager', 'Manager'),
        ('employee', 'Employee'),
    ], ondelete={'coach': 'cascade', 'manager': 'cascade', 'employee': 'cascade'})

    def _determine_responsible(self, on_demand_responsible, employee):
        if self.plan_id.res_model == 'hr.employee':
            error = False
            responsible = False
            if self.responsible_type == 'coach':
                if not employee.coach_id:
                    error = _('Coach of employee %s is not set.', employee.name)
                responsible = employee.coach_id.user_id
                if employee.coach_id and not responsible:
                    error = _("The user of %s's coach is not set.", employee.name)
            elif self.responsible_type == 'manager':
                if not employee.parent_id:
                    error = _('Manager of employee %s is not set.', employee.name)
                responsible = employee.parent_id.user_id
                if employee.parent_id and not responsible:
                    error = _("The manager of %s should be linked to a user.", employee.name)
            elif self.responsible_type == 'employee':
                responsible = employee.user_id
                if not responsible:
                    error = _('The employee %s should be linked to a user.', employee.name)
            if error or responsible:
                return {
                    'responsible': responsible,
                    'error': error,
                }
        return super()._determine_responsible(on_demand_responsible, employee)
