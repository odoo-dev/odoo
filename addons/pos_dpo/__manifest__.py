{
    'name': 'DPO by network POS',
    'version': '1.0',
    'category': 'Sales/Point of Sale',
    'sequence': 6,
    'summary': 'POS Terminal by a Kenyan payment provider covering several African countries.',
    'description': """
Integrate Odoo Point of Sale with DPO’s Network POS terminals for secure, real-time card and mobile payments.
    """,
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
