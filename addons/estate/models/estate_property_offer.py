from odoo import models, fields


class EstatePropertyOffer(models.Model):
    _name = "estate.property.offer"
    _description = "Real Estate Property Offer"

    # Fields
    price = fields.Float(string="Offering Price")
    status = fields.Selection(
        [
            ("accepted", "Accepted"),
            ("refused", "Refused"),
        ],
        string="Status",
        copy=False,
    )

    # keys
    partner_id = fields.Many2one("res.partner", string="Buyer", required=True)
    property_id = fields.Many2one("estate.property", string="Property", required=True)
