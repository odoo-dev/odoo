{
    "name": "Website Dynamic Snippet",
    "version": "1.0",
    "category": "Website/Website",
    "depends": ["website_sale"],
    "author": "Parth Vyas",
    "website": "https://www.odoo.com",
    "description": """
        This module provides a dynamic snippet for displaying sale order details on the website.
    """,
    "data": [
        "views/snippets.xml",
        "views/snippets/s_sale_order_cards.xml",
    ],
    "assets": {
        "web.assets_frontend": [
            "website_dynamic_snippet/static/src/snippets/s_sale_order_cards/000.js",
            "website_dynamic_snippet/static/src/snippets/s_sale_order_cards/000.xml",
        ],
    },
    "installable": True,
    "auto_install": True,
    "license": "LGPL-3",
}
