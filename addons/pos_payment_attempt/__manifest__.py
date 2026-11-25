# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'PoS Payment Attempts',
    'version': '1.0',
    'category': 'Sales/Point of Sale',
    'sequence': 6,
    'summary': 'Log every payment terminal transaction started from the Point of Sale.',
    'description': """
Keeps one line per payment terminal transaction with its current status, including
the ones that never became a payment (declined, cancelled, timed out...).
Payment terminal modules report each step with
``pos.payment.method._log_terminal_transaction``.
    """,
    'depends': ['point_of_sale'],
    'data': [
        'security/ir.access.csv',
        'views/pos_payment_attempt_views.xml',
    ],
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
