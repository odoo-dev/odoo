# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Point of Sale Deposits',
    'category': 'Sales/Point of Sale',
    'summary': 'Add deposit lines for products in the Point of Sale ',
    'description': """

This module allows to quickly add deposit product line for deposit enabled products.

""",
    'depends': ['point_of_sale'],
    'data': [
        'views/products.xml',
    ],
    'assets': {
    },
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
    'uninstall_hook': 'uninstall_hook',
}
