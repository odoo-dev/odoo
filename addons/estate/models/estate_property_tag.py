from odoo import models, fields


class EstatePropertyTag(models.Model):
    _name = "estate.property.tag"
    _description = "Real Estate Property Tag"

    # Fields
    name = fields.Char(string="Name", required=True)

    # Constraints
    _sql_constraints = [
        (
            'unique_tag_name',
            'UNIQUE(name)',
            'A property tag name must be unique.'
        )
    ]
