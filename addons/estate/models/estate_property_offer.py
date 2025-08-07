from odoo import api, models, fields
from odoo.exceptions import UserError
from datetime import datetime, timedelta


class EstatePropertyOffer(models.Model):
    _name = "estate.property.offer"
    _description = "Real Estate Property Offer"
    _order = "price desc"

    # Fields
    price = fields.Float(string="Offering Price")
    status = fields.Selection(
        [
            ("accepted", "Accepted"),
            ("rejected", "Rejected"),
        ],
        string="Status",
        copy=False,
    )
    validity = fields.Integer(string="Validity (days)", default=7)

    # computed
    date_deadline = fields.Date(
        string="Deadline", compute="_compute_date_deadline", inverse="_inverse_date_deadline")

    # keys
    partner_id = fields.Many2one("res.partner", string="Buyer", required=True)
    property_id = fields.Many2one(
        "estate.property", string="Property", required=True)
    property_type_id = fields.Many2one(
        "estate.property.type", string="Property Type",
        related="property_id.property_type_id",
        # store=True,  # This creates the database column
        readonly=False  # Add this temporarily if needed
    )

    @api.depends("create_date", "validity")
    def _compute_date_deadline(self):
        for record in self:
            base_date = record.create_date.date() if record.create_date else fields.Date.today()
            record.date_deadline = base_date + timedelta(days=record.validity)

    def _inverse_date_deadline(self):
        for record in self:
            if record.date_deadline:
                base_date = record.create_date.date() if record.create_date else fields.Date.today()
                record.validity = (record.date_deadline - base_date).days

    # public
    def action_accept(self):
        for record in self:
            if record.property_id.state in ['sold', 'cancelled']:
                raise UserError(
                    "Cannot accept offers for sold or cancelled properties!")

            # Check if another offer is already accepted
            accepted_offers = record.property_id.offer_ids.filtered(
                lambda x: x.status == 'accepted' and x.id != record.id
            )

            if accepted_offers:
                raise UserError(
                    f"An offer from {accepted_offers[0].partner_id.name} is already accepted! "
                    "You must reject it first before accepting this offer."
                )

            # Accept this offer and reject all others
            record.status = "accepted"
            other_offers = record.property_id.offer_ids.filtered(
                lambda x: x.id != record.id)
            other_offers.write({'status': 'rejected'})

            # Set buyer and selling price on property
            record.property_id.write({
                'partner_id': record.partner_id.id,
                'selling_price': record.price,
                'state': 'offer_accepted'
            })
        return True

    def action_reject(self):
        for record in self:
            if record.status == 'accepted':
                # If we're refusing an accepted offer, clear buyer and selling price
                record.property_id.write({
                    'partner_id': False,
                    'selling_price': 0.0,
                    'state': 'offer_received' if record.property_id.offer_ids.filtered(lambda x: x.id != record.id and x.status != 'rejected') else 'new'
                })
            record.status = "rejected"
        return True

    # constraints
    _sql_constraints = [
        (
            'check_offer_price',
            'CHECK(price > 0)',
            'The offer price must be strictly positive.'
        )
    ]
