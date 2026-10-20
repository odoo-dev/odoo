{
    'name': 'POS Mercado Pago',
    'category': 'Sales/Point of Sale',
    'sequence': 6,
    'summary': 'Integrate your POS with the Mercado Pago Smart Point terminal',
    'data': [
        'views/pos_payment_method_views.xml',
        'views/pos_payment_terminal_views.xml',
    ],
    'depends': ['point_of_sale'],
    'assets': {
        'point_of_sale.payment_terminals': [
            'pos_mercado_pago/static/src/**/*',
        ],
        'web.assets_unit_tests': [
            'pos_mercado_pago/static/tests/unit/**/*',
        ],
    },
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
