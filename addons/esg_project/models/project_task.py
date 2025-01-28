# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class ProjectTask(models.Model):
    _inherit = 'project.task'

    generated_emissions = fields.Float(string='Generated Emissions (t/CO2e)')
    reduced_emissions = fields.Float(string='Reduced Emissions (t/CO2e)')
    net_emissions = fields.Float(string='Net Emissions (t/CO2e)', compute='_compute_net_emissions')
    is_esg = fields.Boolean(related='project_id.is_esg')

    @api.depends('generated_emissions', 'reduced_emissions')
    def _compute_net_emissions(self):
        for task in self:
            task.net_emissions = task.generated_emissions - task.reduced_emissions
