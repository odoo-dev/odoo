# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    "name": "POS Printer Windows",
    "version": "18.0.1.0.0",
    "license": "LGPL-3",
    "author": "Odoo PS",
    "category": "Custom Development",
    "website": "https://www.odoo.com",
    "depends": ["point_of_sale"],
    "summary": "POS Printer Windows",
    "description": """
        - Print the POS receipt without IOT.
    """,
    "data": [],
    "assets": {
        "point_of_sale._assets_pos": ["pos_usb_printer/static/src/**/*"],
    },
    'installable': True,
    'application': True,
}
