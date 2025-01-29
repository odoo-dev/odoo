from odoo import _, api, fields, models


class EsgEmissionFactor(models.Model):
    _name = "esg.emission.factor"
    _description = "Emission Factor"

    name = fields.Char(required=True, tracking=True)
    # emissions = fields.Float(
    #     compute="_compute_carbon_value", store=True, string="Emissions"
    # )
    source_id = fields.Many2one('esg.emission.source')
    # activity_type_id = fields.Many2many('esg.activity.type', compute='_compute_activity_type_id')
    company_id = fields.Many2one('res.company')
    validity_start_date = fields.Date()
    validity_end_date = fields.Date()
    uncertainty = fields.Float()
    compute_method = fields.Selection(selection=[('physically', 'Physically (Quantity)'), ('monetary', 'Monetary')])
    uom = fields.Many2one('uom.uom')
    currency = fields.Many2one('res.currency')
    source_database_id = fields.Many2one('esg.database')
    gas_emission_ids = fields.One2many('esg.gas.emission' 'emission_factor_id')
    assignation_ids = fields.One2many('esg.assignation', 'emission_factor_id')
    description = fields.Html()

