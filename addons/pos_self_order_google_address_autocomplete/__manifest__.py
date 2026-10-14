# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': "POS Self Order Google Address Autocomplete",
    'summary': "Google address autocomplete in the Self Order App",
    'category': 'Sales/Point of Sale',
    'depends': ['pos_self_order', 'pos_self_order_geolocalize', 'google_address_autocomplete'],
    'auto_install': ['pos_self_order', 'google_address_autocomplete'],
    'data': [
        'views/pos_preset_views.xml',
    ],
    'assets': {
        'pos_self_order.assets': [
            'pos_self_order_google_address_autocomplete/static/src/**/*',
        ],
        'web.assets_unit_tests_setup': [
            ('remove', 'pos_self_order_google_address_autocomplete/static/src/**/*.css'),
        ],
        'pos_self_order.assets_tests': [
            'pos_self_order_google_address_autocomplete/static/tests/tours/**/*',
        ],
    },
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
