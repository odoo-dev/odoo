{
    'name': 'POS Delivery Management',
    'version': '1.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Manage deliveries directly from the Point of Sale',
    'description': """
        Adds a Deliveries screen to the POS interface to handle:
        - eCommerce pickups (validate Click & Collect)
        - Split deliveries (partial pickup + backorder)
        - Returns with re-shipment
    """,
    'depends': ['point_of_sale', 'sale_stock'],
    'data': [
        'views/pos_config_view.xml',
        'views/res_config_settings_view.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_delivery/static/src/**/*',
        ],
    },
    'installable': True,
    'auto_install': False,
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
