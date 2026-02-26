{
    'name': 'PoS Qlub',
    'category': 'Sales/Point of Sale',
    'summary': 'Integrate your PoS with the Qlub SoftPoS terminal',
    'depends': ['point_of_sale'],
    'data': [
        "views/pos_payment_method_views.xml"
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_qlub/static/src/**/*',
        ],
        'web.assets_tests': [
            'pos_qlub/static/tests/tours/**/*',
        ],
    },
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
