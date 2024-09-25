# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Inventory',
    'version': '1.1',
    'summary': 'Manage your stock and logistics activities',
    'website': 'https://www.odoo.com/app/inventory',
    'depends': ['product', 'barcodes_gs1_nomenclature', 'digest'],
    'category': 'Inventory/Inventory',
    'sequence': 25,
    'demo': [
        'data/stock_demo_pre.xml',
        'data/stock_demo.xml',
        'data/stock_demo2.xml',
        'data/stock_orderpoint_demo.xml',
        'data/stock_storage_category_demo.xml',
    ],
    'data': [
        'security/stock_security.xml',
        'security/ir.model.access.csv',

        'data/digest_data.xml',
        'data/mail_templates.xml',
        'data/default_barcode_patterns.xml',
        'data/stock_data.xml',
        'data/stock_sequence_data.xml',
        'data/stock_traceability_report_data.xml',

        'report/report_stock_quantity.xml',
        'report/report_stock_reception.xml',
        'report/stock_report_views.xml',
        'report/report_package_barcode.xml',
        'report/report_lot_barcode.xml',
        'report/report_location_barcode.xml',
        'report/report_stockpicking_operations.xml',
        'report/report_deliveryslip.xml',
        'report/report_stockinventory.xml',
        'report/report_stock_rule.xml',
        'report/stock_lot_customer.xml',
        'report/package_templates.xml',
        'report/picking_templates.xml',
        'report/product_templates.xml',
        'report/product_packaging.xml',
        'report/report_return_slip.xml',
        'data/mail_template_data.xml',

        'views/stock_menu_views.xml',
        'wizard/stock_change_product_qty_views.xml',
        'wizard/stock_picking_return_views.xml',
        'wizard/stock_inventory_conflict.xml',
        'wizard/stock_backorder_confirmation_views.xml',
        'wizard/stock_quantity_history.xml',
        'wizard/stock_request_count.xml',
        'wizard/stock_replenishment_info.xml',
        'wizard/stock_rules_report_views.xml',
        'wizard/stock_warn_insufficient_qty_views.xml',
        'wizard/product_replenish_views.xml',
        'wizard/product_label_layout_views.xml',
        'wizard/stock_track_confirmation_views.xml',
        'wizard/stock_orderpoint_snooze_views.xml',
        'wizard/stock_package_destination_views.xml',
        'wizard/stock_inventory_adjustment_name.xml',
        'wizard/stock_inventory_warning.xml',
        'wizard/stock_label_type.xml',
        'wizard/stock_lot_label_layout.xml',
        'wizard/stock_quant_relocate.xml',

        'views/res_partner_views.xml',
        'views/product_strategy_views.xml',
        'views/stock_lot_views.xml',
        'views/stock_scrap_views.xml',
        'views/stock_quant_views.xml',
        'views/stock_warehouse_views.xml',
        'views/stock_move_line_views.xml',
        'views/stock_move_views.xml',
        'views/stock_picking_views.xml',
        'views/stock_picking_type_views.xml',
        'views/product_views.xml',
        'views/stock_location_views.xml',
        'views/stock_orderpoint_views.xml',
        'views/stock_storage_category_views.xml',
        'views/res_config_settings_views.xml',
        'views/report_stock_traceability.xml',
        'views/stock_template.xml',
        'views/stock_rule_views.xml',
        'views/stock_package_level_views.xml',
        'views/stock_package_type_view.xml',
        'views/stock_forecasted.xml',
    ],
    'installable': True,
    'application': True,
    'pre_init_hook': 'pre_init_hook',
    'post_init_hook': '_assign_default_mail_template_picking_id',
    'uninstall_hook': 'uninstall_hook',
    'assets': {
        'web.report_assets_common': [
            'stock/static/src/scss/report_stock_reception.scss',
            'stock/static/src/scss/report_stock_rule.scss',
            'stock/static/src/scss/report_stockpicking_operations.scss',
        ],
        'web.assets_backend': [
            'stock/static/src/**/*.js',
            'stock/static/src/**/*.xml',
            'stock/static/src/**/*.scss',
            ('remove', 'stock/static/src/stock_forecasted/forecasted_graph.*'),
        ],
        'web.assets_backend_lazy': [
            'stock/static/src/stock_forecasted/forecasted_graph.*',
        ],
        'web.assets_frontend': [
            'stock/static/src/scss/stock_traceability_report.scss',
        ],
        'web.assets_tests': [
            'stock/static/tests/tours/**/*.js',
        ],
        'web.qunit_suite_tests': [
            'stock/static/tests/counted_quantity_widget_tests.js',
            'stock/static/tests/inventory_report_list_tests.js',
            'stock/static/tests/popover_widget_tests.js',
            'stock/static/tests/stock_traceability_report_backend_tests.js',
            'stock/static/tests/stock_move_one2many_tests.js',
        ],
    },
    'license': 'LGPL-3',
}
