# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': "POS - Repair",
    'category': "Technical",
    'summary': 'Link module between Point of Sale and Repair',
    'depends': ['point_of_sale', 'repair'],
    'installable': True,
    'auto_install': True,
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_repair/static/src/**/*',
            'sale/static/src/js/placeholder_widget/**/*',
        ],
          'web.assets_tests': [
            'pos_repair/static/tests/tours/**/*',
        ],
    },
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
