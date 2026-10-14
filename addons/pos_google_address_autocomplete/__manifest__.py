# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': "POS Google Address Autocomplete",
    'summary': "Google address autocomplete on the customer form of the Point of Sale",
    'category': 'Sales/Point of Sale',
    'depends': ['point_of_sale', 'google_address_autocomplete'],
    'auto_install': True,
    'assets': {
        'point_of_sale._assets_pos': [
            'google_address_autocomplete/static/src/**/*',
            ('remove', 'google_address_autocomplete/static/src/address_autocomplete/google_address_autocomplete_dark.css'),
        ],
        'point_of_sale.assets_prod_dark': [
            'google_address_autocomplete/static/src/address_autocomplete/google_address_autocomplete_dark.css',
        ],
    },
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
