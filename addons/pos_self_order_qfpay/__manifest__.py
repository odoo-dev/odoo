# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    "name": "POS Self Order QFPay",
    "summary": "Addon for the Self Order App that allows customers to pay by QFPay.",
    "category": "Sales/Point Of Sale",
    "depends": ["pos_qfpay", "pos_self_order"],
    'assets': {
        'pos_self_order.assets': [
            'pos_qfpay/static/src/app/qfpay.js',
            'pos_self_order_qfpay/static/**/*',
        ],
    },
    "auto_install": True,
    "author": "Odoo S.A.",
    "license": "LGPL-3",
}
