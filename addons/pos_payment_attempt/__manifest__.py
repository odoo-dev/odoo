# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'PoS Payment Attempts',
    'version': '1.0',
    'category': 'Sales/Point of Sale',
    'sequence': 6,
    'summary': 'Keep a record of every payment terminal attempt made from the Point of Sale.',
    'description': """
Persist terminal payment attempts
=================================

Every payment request sent to a payment terminal is recorded as soon as it is
initiated, and its status is kept up to date until it ends: success, failure,
cancellation, timeout, or a manual force by the cashier.

* Audit trail of all attempts, including the ones that never became a payment.
* Crash recovery: an attempt left open on an order is shown again when the
  payment screen is reopened, so the cashier can check it before retrying.
* Stale attempts are checked with the terminal provider by a scheduled action.
    """,
    'depends': ['point_of_sale'],
    'data': [
        'security/ir.access.csv',
        'data/ir_cron_data.xml',
        'views/pos_payment_attempt_views.xml',
        'views/pos_order_views.xml',
        'views/pos_session_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_payment_attempt/static/src/**/*',
        ],
    },
    'auto_install': True,
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
