{
    "name": "POS Self Order",
    "summary": "Addon for the POS App that allows customers to view the menu on their smartphone.",
    "category": "Sales/Point Of Sale",
    "depends": ["pos_self", "pos_restaurant"],
    "auto_install": ["pos_restaurant"],
    "data": [
        "security/ir.model.access.csv",
        "data/mail_template_data.xml",
        "data/preset_data.xml",
        "views/pos_self_order.index.xml",
        "views/qr_code.xml",
        "views/pos_config_view.xml",
        "views/custom_link_views.xml",
        "views/pos_restaurant_views.xml",
        "views/pos_preset_view.xml",
        "data/init_access.xml",
        "views/res_config_settings_views.xml",
        "views/point_of_sale_dashboard.xml",
        'receipt/pos_order_receipt.xml',
        'receipt/pos_order_change_receipt.xml',
    ],
    "demo": [
        "data/kiosk_demo_data.xml",
    ],
    "assets": {
        # Assets
        'web.assets_unit_tests_setup': [
            ('include', 'pos_self_order.assets'),
            ('remove', 'pos_self_order/static/src/app/root.js'),

            # Remove the backend button to avoid test conflicts
            ('remove', 'pos_self_order/static/src/backend/pos_open_ui_button/pos_open_ui_button.js'),

            # Remove CSS files since we're not testing the UI with hoot in PoS self order
            # CSS files make html_editor tests fail
            ('remove', 'pos_self_order/static/src/**/*.scss'),

            # Re-include debug and router files that were removed in point_of_sale.base_app
            # but are required for running unit tests
            'web/static/src/core/debug/**/*',
            'web/static/src/core/browser/router.js',
        ],
        'web.assets_unit_tests': [
            'pos_self_order/static/tests/unit/**/*',
        ],
        'point_of_sale._assets_pos': [
            'pos_self_order/static/src/backend/qr_order_button/*',
            'pos_self_order/static/src/overrides/**/*',
        ],
        'web.assets_backend': [
            "pos_self_order/static/src/upgrade_selection_field.js",
            'pos_self_order/static/src/backend/qr_order_button/*',
            'pos_self_order/static/src/backend/pos_open_ui_button/pos_open_ui_button.js',
        ],
        "pos_self_order.assets": [
            ("include", "pos_self.assets"),
            "pos_self_order/static/src/overrides/utils/printer/generate_printer_data.js",
            "pos_self_order/static/src/app/**/*",
            "pos_restaurant/static/src/app/models/restaurant_table.js",
        ],
        # Assets tests
        "pos_self_order.assets_tests": [
            ("include", "point_of_sale.base_tests"),
            "pos_self_order/static/tests/tours/**/*",
            "point_of_sale/static/tests/generic_helpers/numpad_util.js",
            "point_of_sale/static/tests/generic_helpers/dialog_util.js",
            "point_of_sale/static/tests/generic_helpers/utils.js",
        ],
        'web.assets_tests': [
            'pos_self_order/static/tests/pos/**/*',
        ],
    },
    "author": "Odoo S.A.",
    "license": "LGPL-3",
}
