from odoo import models


class ProjectTaskType(models.Model):
    _inherit = 'project.task.type'

    _hr_timesheet__internal_project_default_stage = models.Ref('hr_timesheet.internal_project_default_stage', 'project.task.type', required=False)
