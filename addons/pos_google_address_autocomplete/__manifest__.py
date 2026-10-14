# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': "POS Google Address Autocomplete",
    'summary': "Google address autocomplete on the customer form of the Point of Sale",
    'category': 'Sales/Point of Sale',
    'depends': ['point_of_sale', 'google_address_autocomplete'],
    'auto_install': True,
    'assets': {
        # The Point of Sale opens the backend customer form, on which
        # google_address_autocomplete sets its widget.
        'point_of_sale._assets_pos': [
            'google_address_autocomplete/static/src/**/*',
        ],
    },
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
