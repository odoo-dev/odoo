# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    _project__mt_project_stage_change = models.Ref('project.mt_project_stage_change', 'mail.message.subtype')

    module_hr_timesheet = fields.Boolean(string="Task Logs")
    group_project_stages = fields.Boolean("Project Stages", implied_group="project.group_project_stages")

    def set_values(self):
        # Hide Project Stage Changed mail subtype according to the settings
        if self._project__mt_project_stage_change.hidden == self['group_project_stages']:
            self._project__mt_project_stage_change.hidden = not self['group_project_stages']
        super().set_values()
