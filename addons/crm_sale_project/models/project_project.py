from odoo import api, models


class ProjectProject(models.Model):
    _inherit = 'project.project'

    @api.model
    def default_get(self, fields):
        defaults = super().default_get(fields)
        if self.env.context.get('default_lead_id'):
            defaults['allow_billable'] = True
        return defaults
