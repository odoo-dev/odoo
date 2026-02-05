# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    "name": "POS Star Receipt Printer",
    "version": "1.0.0",
    "category": "Sales/Point of Sale",
    "summary": "Star ePOS Printers in PoS",
    "description": """
Use Star ePOS Printers without the IoT Box in the Point of Sale
    """,
    "depends": ["point_of_sale"],
    "data": [
        "views/pos_printer_view.xml",
    ],
    "assets": {
        "web.assets_backend": [
            "pos_star_printer/static/src/backend/**/*",
            "pos_star_printer/static/src/app/components/star_webprnt_templates.xml",
        ],
        "point_of_sale._assets_pos": [
            "pos_star_printer/static/src/app/**/*",
        ],
    },
    'author': 'Odoo S.A.',
    "license": "LGPL-3",
}
