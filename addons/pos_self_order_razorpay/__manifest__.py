{
    "name": "POS Self Order Razorpay",
    "summary": "Addon for the Self Order App that allows customers to pay by Razorpay POS Terminal.",
    "category": "Sales/Point Of Sale",
    "depends": ["pos_razorpay", "pos_self"],
    "auto_install": True,
    'assets': {
        'pos_self.assets': [
            'pos_self_order_razorpay/static/**/*',
        ],
    },
    "author": "Odoo S.A.",
    "license": "LGPL-3",
}
