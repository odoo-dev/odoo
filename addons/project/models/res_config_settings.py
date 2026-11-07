# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    module_hr_timesheet = fields.Boolean(string="Task Logs")
    group_project_stages = fields.Boolean("Project Stages", implied_group="project.group_project_stages")

    def set_values(self):
        # Hide Project Stage Changed mail subtype according to the settings
        if self.env['mail.message.subtype'].ref('project.mt_project_stage_change').hidden == self['group_project_stages']:
            self.env['mail.message.subtype'].ref('project.mt_project_stage_change').hidden = not self['group_project_stages']
        super().set_values()
