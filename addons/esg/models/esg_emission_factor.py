from odoo import _, api, fields, models


class EsgEmissionFactor(models.Model):
    _name = 'esg.emission.factor'
    _description = 'Emission Factor'

    name = fields.Char(required=True)
    sequence = fields.Integer()

    # to validate with bedo
    # code = fields.Char(string="Code", required=True)
    # factor_type = fields.Selection(selection=[('element', 'Element'), ('post', 'Post')], default='element')
    co2_equivalent = fields.Float(compute='_compute_co2_equivalent')
    co2_equivalent_range_min = fields.Float(compute='_compute_co2_equivalent')
    co2_equivalent_range_max = fields.Float(compute='_compute_co2_equivalent')

    emissions_value = fields.Float(compute='_compute_emissions_value', string='Emissions', readonly=False, store=True)
    source_id = fields.Many2one('esg.emission.source')
    activity_type_ids = fields.Many2many('esg.activity.type', string='Activity Types', compute='_compute_activity_type_id')
    company_id = fields.Many2one('res.company')

    valid_from = fields.Date()
    valid_to = fields.Date()
    last_update = fields.Date()

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
    database_id = fields.Many2one('esg.database')
    emission_line_ids = fields.One2many('esg.emission.factor.line', 'emission_factor_id')
    assignation_ids = fields.One2many('esg.emission.factor.line.assignation', 'emission_factor_id')
    description = fields.Html()

    @api.depends('emission_line_ids.total_value', 'compute_method', 'uom_id', 'currency_id')
    def _compute_emissions_value(self):
        for factor in self:
            if factor.compute_method == 'physically':
                factor.emissions_value = sum([emission.uom_id._compute_quantity(emission.total_value, factor.uom_id) for emission in factor.emission_line_ids])
            else:
                factor.emissions_value = sum([emission.currency_id._convert(emission.total_value, factor.currency_id) for emission in factor.emission_line_ids])

    @api.depends('emission_line_ids.activity_type_id')
    def _compute_activity_type_id(self):
        for factor in self:
            factor.activity_type_ids = factor.emission_line_ids.activity_type_id.ids


    @api.depends('emission_line_ids')
    def _compute_co2_equivalent(self):
        for factor in self:
            co2_value = sum(factor.emission_line_ids.mapped('co2_equivalent'))
            factor.co2_equivalent = co2_value
            factor.co2_equivalent_range_min = co2_value * (1 - factor.uncertainty / 100)
            factor.co2_equivalent_range_max = co2_value * (1 + factor.uncertainty / 100)
