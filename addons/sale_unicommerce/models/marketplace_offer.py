# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models

class MarketplaceOffer(models.Model):   
    _name = 'marketplace.offer'
    _description = 'Marketplace Offer'
    _order = 'create_date desc'

    code = fields.Char( help="Marketplace code like 'shopify'")
    external_id = fields.Char("External Product ID", required=True, index=True)
    external_variant_id = fields.Char("External Variant ID")
    marketplace_id = fields.Many2one("crm.team", ondelete="cascade")

    name = fields.Char("Title")
    sku = fields.Char("SKU")
    price = fields.Float("Price")
    barcode = fields.Char("Barcode")
    weight = fields.Float("Weight")
    weight_uom = fields.Char("Weight Unit")

    available_quantity = fields.Float("Available Quantity")
    inventory_policy = fields.Selection([
        ('deny', 'Deny when out of stock'),
        ('continue', 'Continue selling')
    ], string="Inventory Policy")
    inventory_management = fields.Char("Inventory Management")
    inventory_item_id = fields.Char("Inventory Item ID")

    processed = fields.Boolean("Processed", default=False)
    product_id = fields.Many2one("product.product", string="Matched Product")
