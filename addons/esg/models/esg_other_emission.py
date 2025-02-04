from odoo import api, fields, models, tools


class OtherEmission(models.Model):
    _name = 'esg.other.emission'
    _description = 'ESG Other Emission'

    date = fields.Date(required=True)
    emission_factor_id = fields.Many2one('esg.emission.factor', required=True)
    note = fields.Text()
    quantity = fields.Integer(default=1, required=True)
    value = fields.Float(string='CO2', compute='_compute_value', store=True)
    uncertainty = fields.Float(related='emission_factor_id.uncertainty')

    @api.depends('quantity', 'emission_factor_id') # do not depend on emission_factor_id.emissions_value because we only do the recomputation when using the wizard 'factors_retroaction_wizard' for a given date
    def _compute_value(self):
        for line in self:
            line.value = line.quantity * line.emission_factor_id.emissions_value
