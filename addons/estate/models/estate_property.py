from odoo import api, models, fields
from odoo.exceptions import UserError
from dateutil.relativedelta import relativedelta


class EstateProperty(models.Model):
    _name = "estate.property"
    _description = "Real Estate Property"

    name = fields.Char(string="Name", required=True)
    description = fields.Text(string="Description")
    postcode = fields.Char(string="Postcode")
    date_availability = fields.Date(
        string="Date Availability",
        copy=False,
        default=fields.Date.add(fields.Date.today() + relativedelta(months=3)),
    )
    expected_price = fields.Float(string="Expected Price", required=True)
    selling_price = fields.Float(
        string="Selling Price", readonly=True, copy=False)
    bedrooms = fields.Integer(string="Bedrooms", default=2)
    living_area = fields.Integer(string="Living Area")
    facades = fields.Integer(string="Facades")
    garage = fields.Boolean(string="Garage")
    garden = fields.Boolean(string="Garden")
    garden_area = fields.Integer(string="Garden Area")
    garden_orientation = fields.Selection(
        string="Garden Orientation",
        selection=[
            ("north", "North"),
            ("south", "South"),
            ("east", "East"),
            ("west", "West"),
        ],
        help="Four basic cardinals",
    )
    state = fields.Selection(
        [
            ("new", "New"),
            ("offer_received", "Offer Received"),
            ("offer_accepted", "Offer Accepted"),
            ("sold", "Sold"),
            ("cancelled", "Cancelled"),
        ],
        string="State",
        required=True,
        copy=False,
        default="new",
        # readonly=True,
    )

    # computed
    total_area = fields.Float(
        compute="_compute_total_area", string="Total Area (sqm)", copy=False, readonly=True)
    best_price = fields.Float(
        compute="_compute_best_price", string="Best Offer", readonly=True
    )

    # reserved fields
    active = fields.Boolean("Active", default=True)

    # keys
    property_type_id = fields.Many2one(
        "estate.property.type", string="property_type")
    partner_id = fields.Many2one("res.partner", string="Buyer", copy=False)
    seller_id = fields.Many2one(
        "res.users", string="Salesperson", default=lambda self: self.env.user
    )
    tag_ids = fields.Many2many("estate.property.tag", string="Tags")
    offer_ids = fields.One2many(
        "estate.property.offer", "property_id", string="Offers")

    @api.depends("garden_area", "living_area")
    def _compute_total_area(self):
        for record in self:
            record.total_area = self.garden_area + self.living_area

    @api.depends("offer_ids.price")
    def _compute_best_price(self):
        for record in self:
            prices = record.offer_ids.mapped('price')
            record.best_price = max(prices, default=0.0)

    @api.onchange("garden")
    def _onchange_garden(self):
        if (self.garden):
            self.garden_area = 10
            self.garden_orientation = "north"
        else:
            self.garden_area = 0
            self.garden_orientation = ""

    # public
    def action_estate_property_sold(self):
        for record in self:
            if record.state == "cancelled":
                raise UserError(
                    "You already cancelled, man. Price has gone up (not really)")

            # Check for an accepted offer
            accepted_offers = record.offer_ids.filtered(
                lambda x: x.status == 'accepted')
            if not accepted_offers:
                raise UserError(
                    "No offer has been accepted yet! Please accept an offer before marking as sold."
                )

            record.state = "sold"
        return True

    def action_estate_property_cancel(self):
        for record in self:
            if record.state == "sold":
                raise UserError(
                    "They already paid, no takesie-backsies. That'd be a scam otherwise!")

            record.state = "cancelled"
            # Reject all offers when cancelling property
            record.offer_ids.write({'status': 'refused'})
        return True
