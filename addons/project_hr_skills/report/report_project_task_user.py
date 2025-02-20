# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class ReportProjectTaskUser(models.Model):
    _inherit = 'report.project.task.user'

    user_skill_ids = fields.Many2many('hr.employee.skill', string='Skills', compute='_compute_user_skill_ids', compute_sudo=True)

    @api.depends('user_ids.employee_skill_ids')
    def _compute_user_skill_ids(self):
        for report in self:
            report.user_skill_ids = report.user_ids.employee_skill_ids
