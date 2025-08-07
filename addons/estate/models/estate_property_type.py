from odoo import api,models, fields


class EstatePropertyType(models.Model):
    _name = "estate.property.type"
    _description = "Real Estate Property Type"
    _order = "name"

    # Fields
    name = fields.Char(string="Name", required=True)
    sequence = fields.Integer(string="Sequence", default=1)

    # Related
    property_ids = fields.One2many(
        "estate.property", "property_type_id", string="Properties")
    offer_ids = fields.One2many(
        "estate.property.offer",
        "property_type_id",
        string="Offers"
    )
    offer_count = fields.Integer(
        string="Offers Count",
        compute="_compute_offer_count"
    )

    @api.depends('offer_ids')
    def _compute_offer_count(self):
        for record in self:
            record.offer_count = len(record.offer_ids)

    # constraints
    _sql_constraints = [
        (
            'unique_type_name',
            'UNIQUE(name)',
            'A property type name must be unique.'
        )
    ]

# inline list view


# class EstatePropertyTypeLine(models.Model):
#     _name = "estate.property.type.view.line"
#     _description = "Real Estate Property Type Lines"

#     model_id = fields.Many2one("estate.property.type")
