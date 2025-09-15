from odoo import fields, models


class MarketplaceOffer(models.Model):
    _name = 'marketplace.offer'
    _description = "Marketplace Offer/Listing/Product"

    # In different marketplaces, products can be uniquely identified using different fields.
    # - Some marketplaces use only SKU as a unique identifier.
    # - Some use a product ID and SKU both, but SKU is not be mandatory and product ID is mandatory.

    name = fields.Char(string="Title", readonly=True)
    sku = fields.Char(string="SKU", required=True, readonly=True)
    # marketplace_offer_identifier
    mp_product_identifier = fields.Char(
        string="Marketplace Product ID",
        help="Unique id of the product in the marketplace",
    )
    mp_product_template_identifier = fields.Char(
        string="Marketplace Product Template ID",
        help="Unique id of the product template in the marketplace",
    )
    # identifier_type = fields.Selection(
    #     selection=[
    #         ('product', 'Product Variant'),
    #         ('template', 'Product Template'),
    #     ],
    #     required=True,
    #     default='product',
    # )

    matched_product_id = fields.Many2one(
        comodel_name='product.product',
        string="Matched Product",
        domain=[('sale_ok', '=', True)],
    )
    marketplace_account_id = fields.Many2one(
        comodel_name='marketplace.account',
        string="Marketplace Account",
        readonly=True,
        ondelete='restrict',
    )

    _unique_mp_account_sku = models.Constraint(
        "UNIQUE(marketplace_account_id, sku)",
        "The SKU must be unique per marketplace account."
    )
    _unique_mp_account_mp_product_id_mp_product_template_id = models.Constraint(
        "UNIQUE(marketplace_account_id, mp_product_template_identifier, mp_product_identifier)",
        "The combination of marketplace product id and marketplace product template id must be unique per mp account."
    )
    # _unique_mp_account_matched_product_id = models.Constraint(
    #     "UNIQUE(marketplace_account_id, matched_product_id)",
    #     "The matched odoo product id must be unique per marketplace account."
    # )

    def action_view_online(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_url',
            'url': self.marketplace_account_id._get_product_url(self),
            'target': 'new',
        }

    def auto_match_products(self):
        existing_product_default_codes = self.env['product.product'].search([]).mapped('default_code')
        for offer in self:
            if offer.sku and offer.sku in existing_product_default_codes:
                offer.matched_product_id = self.env['product.product'].search([('default_code', '=', offer.sku)], limit=1).id
