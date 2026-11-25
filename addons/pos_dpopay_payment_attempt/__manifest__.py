# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'PoS DPO Pay Payment Attempts',
    'version': '1.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Log every DPO Pay terminal transaction.',
    'description': "Logs every DPO Pay terminal transaction and its status in PoS Payment Attempts.",
    'depends': ['pos_dpopay', 'pos_payment_attempt'],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_dpopay_payment_attempt/static/src/**/*',
        ],
    },
    'auto_install': True,
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
