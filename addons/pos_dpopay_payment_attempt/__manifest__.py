# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'PoS DPO Pay Payment Attempts',
    'version': '1.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Record every DPO Pay terminal request as a payment attempt.',
    'description': """
Bridge between PoS DPO Pay and PoS Payment Attempts: the DPO Pay requests that go
through the server update the payment attempt, and the attempt status can be
checked with the terminal afterwards.
    """,
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
