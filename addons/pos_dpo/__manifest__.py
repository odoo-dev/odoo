# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'DPO POS',
    'version': '1.0',
    'category': 'Sales/Point of Sale',
    'sequence': 6,
    'summary': 'Integrate your POS with DPO payment terminal.',
    'data': [
        'security/ir.model.access.csv',
        'views/pos_payment_method_views.xml',
    ],
    'depends': ['point_of_sale'],
    'installable': True,
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_dpo/static/src/**/*',
        ],
        'web.assets_tests': [
            'pos_dpo/static/tests/tours/**/*',
        ],
    },
    'author': 'Odoo India Pvt. Ltd.',
    'license': 'LGPL-3',
}
