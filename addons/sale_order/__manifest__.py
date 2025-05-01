{
    'name': 'Sale Order',
    'category': 'Website/Website',
    'depends': ['website_sale'],
    'version': '1.0',
    'license': 'LGPL-3',
    'author': 'Odoo IN',
    'data': [
        'views/snippets/snippets.xml',
        'views/snippets/s_sale_order.xml',
    ],
    'auto_install': True,
    'assets': {
        'web.assets_frontend': [
            'sale_order/static/src/snippets/s_sale_order/sale_order_snippet.js',
            'sale_order/static/src/snippets/s_sale_order/sale_order.xml',
        ],
        'web.assets_tests': [
            'sale_order/static/tests/tours/snippet_sale_order.js',
        ],
    }
}
