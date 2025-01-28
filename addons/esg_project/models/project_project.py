# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class ProjectProject(models.Model):
    _inherit = 'project.project'

    is_esg = fields.Boolean(compute='_compute_is_esg')

    def _compute_is_esg(self):
        for project in self:
            project.is_esg = project.id == self.env.ref('esg_project.esg_project_project_0').id

    def _view_esg_project_tasks(self):
        project = self.env.ref('esg_project.esg_project_project_0')
        action = project.action_view_tasks()
        action['domain'] = action['domain'].replace('active_id', str(project.id))
        return action
