from odoo import _, api, fields, models


class EsgEmissionFactor(models.Model):
    _name = 'esg.emission.factor'
    _description = 'Emission Factor'

    name = fields.Char(required=True)
    emissions_value = fields.Float(compute='_compute_emissions_value', string='Emissions')
    source_id = fields.Many2one('esg.emission.source')
    activity_type_ids = fields.Many2many('esg.activity.type', string='Activity Types', compute='_compute_activity_type_id')
    company_id = fields.Many2one('res.company')
    validity_start_date = fields.Date()
    validity_end_date = fields.Date()
    uncertainty = fields.Float()
    compute_method = fields.Selection(selection=[
            ('physically', 'Physically (Quantity)'),
            ('monetary', 'Monetary')
        ],
        required=True,
        default='physically',
    )
    uom_id = fields.Many2one('uom.uom')
    currency_id = fields.Many2one('res.currency')
    source_database_id = fields.Many2one('esg.database')
    gas_emission_ids = fields.One2many('esg.gas.emission', 'emission_factor_id')
    assignation_ids = fields.One2many('esg.assignation', 'emission_factor_id')
    description = fields.Html()

    @api.depends('gas_emission_ids.total_value', 'compute_method', 'uom_id', 'currency_id')
    def _compute_emissions_value(self):
        for factor in self:
            if factor.compute_method == 'physically':
                factor.emissions_value = sum([emission.uom_id._compute_quantity(emission.total_value, factor.uom_id) for emission in factor.gas_emission_ids])
            else:
                factor.emissions_value = sum([emission.currency_id._convert(emission.total_value, factor.currency_id) for emission in factor.gas_emission_ids])

    @api.depends('gas_emission_ids.activity_type_id')
    def _compute_activity_type_id(self):
        for factor in self:
            factor.activity_type_ids = factor.gas_emission_ids.activity_type_id.ids
