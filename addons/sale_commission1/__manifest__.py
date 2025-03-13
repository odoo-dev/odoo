{
    "name": "Sale Commission",
    "version": "1.0",
    "summary": "commission on sales order",
    "description": """
        provide sales order comission
    """,
    "author": "Odoo",
    "depends": ["sale_management"],
    'auto_install': True,
    'data': [
        "views/sale_order_views.xml",
    ],
    'assets': {
      'web.assets_backend': [
            'sale_commission1/static/src/components/**/*',
        ],
    },
    "license": "LGPL-3",
}
