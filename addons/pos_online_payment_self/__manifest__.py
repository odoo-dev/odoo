# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': 'POS Self / Online Payment',
    'category': 'Sales/Point of Sale',
    'summary': 'Support online payment in self',
    'depends': ['pos_online_payment', 'pos_self'],
    'auto_install': True,
    'assets': {
        'pos_self.assets': [
            'pos_online_payment_self/static/src/app/**/*',
            'point_of_sale/static/lib/qrcode.js',
        ],
    },
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
