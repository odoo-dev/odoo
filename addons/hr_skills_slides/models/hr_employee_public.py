# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class HrEmployeePublic(models.Model):
    _inherit = 'hr.employee.public'

    has_subscribed_courses = fields.Boolean(related='employee_id.has_subscribed_courses', related_sudo=True)
    courses_completion_text = fields.Char(related='employee_id.courses_completion_text', related_sudo=True)

    def action_open_courses(self):
        self.ensure_one()
        if self.is_user:
            return self.employee_id.action_open_courses()
