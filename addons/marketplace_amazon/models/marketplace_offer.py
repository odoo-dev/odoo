from odoo import fields, models


class MarketplaceOffer(models.Model):
    _inherit = 'marketplace.offer'

    amazon_product_type = fields.Char(string="Amazon Product Type")
    amazon_fulfillment_type = fields.Selection(
        string="Amazon Fulfillment Type",
        help="Each amazon offer can be either fulfilled by the merchant or by the marketplace.",
        selection=[('FBMe', "Fulfilled by Merchant"), ('FBMa', "Fulfilled by Marketplace")],
    )
