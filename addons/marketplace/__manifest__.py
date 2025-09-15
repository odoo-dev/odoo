# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    "name": "Marketplace Engine",
    "version": "1.0",
    "category": "Sales/Sales",
    "summary": "The marketplace engine used by marketplace channel modules.",
    "description": """
Marketplace integrations base to connect Odoo with various e-commerce platforms.
================================================================================
This module provides the functionality to integrate Odoo with different e-commerce platforms,
allowing for synchronization of products, orders, and inventory across systems.
    """,
    "depends": ["sale_management", "stock_delivery"],
    "data": [
        "security/ir.model.access.csv",
        "security/marketplace_account_security.xml",
        "views/sale_order_views.xml",
        "views/marketplace_channel_views.xml",
        "views/marketplace_account_views.xml",
        "views/marketplace_offer_views.xml",
        "views/product_product_views.xml",
        "views/stock_location_views.xml",
        "views/stock_picking_views.xml",
        "views/marketplace_location_views.xml",
        "views/marketplace_menus.xml",
        "data/marketplace_data.xml",
        "data/mail_template_data.xml",
    ],
    "author": "Odoo S.A.",
    'installable': True,
    'application': True,
    "license": "OEEL-1",
}
