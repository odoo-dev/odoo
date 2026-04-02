{
    "name": "POS Self Checkout",
    "summary": "Addon for the POS App that allows customers to view checkout on their own.",
    "category": "Sales/Point Of Sale",
    "depends": ["pos_self"],
    "data": [
        "views/pos_self_checkout.index.xml",
        "views/point_of_sale_dashboard.xml",
    ],
    "assets": {
        'point_of_sale._assets_pos': [
            'pos_self_checkout/static/src/overrides/**/*',
        ],
        "pos_self_checkout.assets": [
            ("include", "pos_self.assets"),
            "point_of_sale/static/src/app/utils/use_timed_press/**/*",
            "point_of_sale/static/src/app/components/orderline/**/*",
            "point_of_sale/static/src/app/components/centered_icon/**/*",
            "point_of_sale/static/src/app/components/order_display/**/*",
            "point_of_sale/static/src/app/hooks/time_hook.js",
            "pos_self_checkout/static/src/app/**/*",
        ],
    },
    "author": "Odoo S.A.",
    "license": "LGPL-3",
}
