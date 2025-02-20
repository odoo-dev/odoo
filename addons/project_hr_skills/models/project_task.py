# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class ProjectTask(models.Model):
    _inherit = "project.task"

    user_skill_ids = fields.Many2many('hr.employee.skill', compute='_compute_user_skill_ids', compute_sudo=True)

    @api.depends('user_ids.employee_skill_ids')
    def _compute_user_skill_ids(self):
        for task in self:
            task.user_skill_ids = task.user_ids.employee_skill_ids
