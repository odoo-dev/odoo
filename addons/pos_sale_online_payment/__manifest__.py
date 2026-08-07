# Part of Odoo. See LICENSE file for full copyright and licensing details.


{
    'name': 'POS - Sales - Online Payment',
    'version': '1.0',
    'category': 'Sales/Point of Sale',
    'sequence': 6,
    'summary': 'Link module between Point of Sale, Sales and Online Payment',
    'description': """

Settle in the Point of Sale the Sale Orders the customer already paid online. The
accounting payment created by the online transaction is reused instead of collecting
the amount a second time.
""",
    'depends': ['pos_sale', 'pos_online_payment'],
    'auto_install': True,
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_sale_online_payment/static/src/**/*',
        ],
    },
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
