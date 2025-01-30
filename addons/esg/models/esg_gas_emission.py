from odoo import api, fields, models, _


class EsgGasEmission(models.Model):
    _name = 'esg.gas.emission'
    _description = 'Gas Emission'

    gas_id = fields.Many2one('esg.gas')
    activity_type_id = fields.Many2one('esg.activity.type')
    value = fields.Float()
    total_value = fields.Float(compute='_compute_total_value', store='True')
    uom_id = fields.Many2one('uom.uom')
    currency_id = fields.Many2one('res.currency')
    emission_factor_id = fields.Many2one('esg.emission.factor')
    compute_method = fields.Selection(related='emission_factor_id.compute_method')

    @api.depends('value', 'gas_id.factor')
    def _compute_total_value(self):
        for emission in self:
            emission.total_value = emission.value * emission.gas_id.factor
