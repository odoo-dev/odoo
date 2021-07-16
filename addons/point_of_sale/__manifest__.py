# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Point of Sale',
    'version': '1.0.1',
    'category': 'Sales/Point of Sale',
    'sequence': 40,
    'summary': 'User-friendly PoS interface for shops and restaurants',
    'description': "",
    'depends': ['stock_account', 'barcodes', 'web_editor', 'digest'],
    'data': [
        'security/point_of_sale_security.xml',
        'security/ir.model.access.csv',
        'data/default_barcode_patterns.xml',
        'data/digest_data.xml',
        'wizard/pos_box.xml',
        'wizard/pos_details.xml',
        'wizard/pos_payment.xml',
        'wizard/pos_close_session_wizard.xml',
        'views/pos_assets_common.xml',
        'views/pos_assets_index.xml',
        'views/pos_assets_qunit.xml',
        'views/point_of_sale_report.xml',
        'views/point_of_sale_view.xml',
        'views/pos_order_view.xml',
        'views/pos_category_view.xml',
        'views/product_view.xml',
        'views/account_journal_view.xml',
        'views/res_config_settings_views.xml',
        'views/pos_payment_method_views.xml',
        'views/pos_payment_views.xml',
        'views/pos_config_view.xml',
        'views/pos_session_view.xml',
        'views/point_of_sale_sequence.xml',
        'data/point_of_sale_data.xml',
        'views/pos_order_report_view.xml',
        'views/account_statement_view.xml',
        'views/digest_views.xml',
        'views/res_partner_view.xml',
        'views/report_userlabel.xml',
        'views/report_saledetails.xml',
        'views/point_of_sale_dashboard.xml',
        'views/report_invoice.xml',
    ],
    'demo': [
        'data/point_of_sale_demo.xml',
    ],
    'installable': True,
    'application': True,
    'website': 'https://www.odoo.com/app/point-of-sale-shop',
    'assets': {
        'web.assets_tests': [
            'point_of_sale/static/tests/tours/**/*',
        ],
        'point_of_sale.assets': [
            'web/static/fonts/fonts.scss',
            'web/static/lib/fontawesome/css/font-awesome.css',
            'point_of_sale/static/src/css/pos.css',
            'point_of_sale/static/src/css/keyboard.css',
            'point_of_sale/static/src/css/pos_receipts.css',
            'point_of_sale/static/src/css/popups/product_info_popup.css',
            'point_of_sale/static/src/css/popups/cash_opening_popup.css',
            'point_of_sale/static/src/css/popups/closing_pos_popup.css',
            'web/static/src/legacy/scss/fontawesome_overridden.scss',
            'point_of_sale/static/lib/html2canvas.js',
            'point_of_sale/static/lib/backbone/backbone.js',
            'point_of_sale/static/lib/waitfont.js',
            'point_of_sale/static/lib/sha1.js',
            'point_of_sale/static/src/js/utils.js',
            'point_of_sale/static/src/js/ClassRegistry.js',
            'point_of_sale/static/src/js/PosComponent.js',
            'point_of_sale/static/src/js/PosContext.js',
            'point_of_sale/static/src/js/ComponentRegistry.js',
            'point_of_sale/static/src/js/Registries.js',
            'point_of_sale/static/src/js/db.js',
            'point_of_sale/static/src/js/models.js',
            'point_of_sale/static/src/js/keyboard.js',
            'point_of_sale/static/src/js/barcode_reader.js',
            'point_of_sale/static/src/js/printers.js',
            'point_of_sale/static/src/js/Gui.js',
            'point_of_sale/static/src/js/PopupControllerMixin.js',
            'point_of_sale/static/src/js/ControlButtonsMixin.js',
            'point_of_sale/static/src/js/Chrome.js',
            'point_of_sale/static/src/js/devices.js',
            'point_of_sale/static/src/js/payment.js',
            'point_of_sale/static/src/js/custom_hooks.js',
            'point_of_sale/static/src/js/Screens/ProductScreen/ProductScreen.js',
            'point_of_sale/static/src/js/Screens/ClientListScreen/ClientLine.js',
            'point_of_sale/static/src/js/Screens/ClientListScreen/ClientDetailsEdit.js',
            'point_of_sale/static/src/js/Screens/ClientListScreen/ClientListScreen.js',
            'point_of_sale/static/src/js/Screens/TicketScreen/ControlButtons/InvoiceButton.js',
            'point_of_sale/static/src/js/Screens/TicketScreen/ControlButtons/ReprintReceiptButton.js',
            'point_of_sale/static/src/js/Screens/TicketScreen/OrderDetails.js',
            'point_of_sale/static/src/js/Screens/TicketScreen/OrderlineDetails.js',
            'point_of_sale/static/src/js/Screens/TicketScreen/ReprintReceiptScreen.js',
            'point_of_sale/static/src/js/Screens/TicketScreen/TicketScreen.js',
            'point_of_sale/static/src/js/Screens/PaymentScreen/PSNumpadInputButton.js',
            'point_of_sale/static/src/js/Screens/PaymentScreen/PaymentScreenNumpad.js',
            'point_of_sale/static/src/js/Screens/PaymentScreen/PaymentScreenElectronicPayment.js',
            'point_of_sale/static/src/js/Screens/PaymentScreen/PaymentScreenPaymentLines.js',
            'point_of_sale/static/src/js/Screens/PaymentScreen/PaymentScreenStatus.js',
            'point_of_sale/static/src/js/Screens/PaymentScreen/PaymentMethodButton.js',
            'point_of_sale/static/src/js/Screens/PaymentScreen/PaymentScreen.js',
            'point_of_sale/static/src/js/Screens/ProductScreen/Orderline.js',
            'point_of_sale/static/src/js/Screens/ProductScreen/OrderSummary.js',
            'point_of_sale/static/src/js/Screens/ProductScreen/OrderWidget.js',
            'point_of_sale/static/src/js/Screens/ProductScreen/NumpadWidget.js',
            'point_of_sale/static/src/js/Screens/ProductScreen/ActionpadWidget.js',
            'point_of_sale/static/src/js/Screens/ProductScreen/CategoryBreadcrumb.js',
            'point_of_sale/static/src/js/Screens/ProductScreen/CategoryButton.js',
            'point_of_sale/static/src/js/Screens/ProductScreen/CategorySimpleButton.js',
            'point_of_sale/static/src/js/Screens/ProductScreen/HomeCategoryBreadcrumb.js',
            'point_of_sale/static/src/js/Screens/ProductScreen/ProductsWidgetControlPanel.js',
            'point_of_sale/static/src/js/Screens/ProductScreen/ProductItem.js',
            'point_of_sale/static/src/js/Screens/ProductScreen/ProductList.js',
            'point_of_sale/static/src/js/Screens/ProductScreen/ProductsWidget.js',
            'point_of_sale/static/src/js/Screens/ReceiptScreen/WrappedProductNameLines.js',
            'point_of_sale/static/src/js/Screens/ReceiptScreen/OrderReceipt.js',
            'point_of_sale/static/src/js/Screens/ReceiptScreen/ReceiptScreen.js',
            'point_of_sale/static/src/js/Screens/ScaleScreen/ScaleScreen.js',
            'point_of_sale/static/src/js/ChromeWidgets/CashierName.js',
            'point_of_sale/static/src/js/ChromeWidgets/ProxyStatus.js',
            'point_of_sale/static/src/js/ChromeWidgets/SyncNotification.js',
            'point_of_sale/static/src/js/ChromeWidgets/HeaderButton.js',
            'point_of_sale/static/src/js/ChromeWidgets/SaleDetailsButton.js',
            'point_of_sale/static/src/js/ChromeWidgets/CashMoveButton.js',
            'point_of_sale/static/src/js/ChromeWidgets/TicketButton.js',
            'point_of_sale/static/src/js/Misc/CurrencyAmount.js',
            'point_of_sale/static/src/js/Misc/Draggable.js',
            'point_of_sale/static/src/js/Misc/NotificationSound.js',
            'point_of_sale/static/src/js/Misc/IndependentToOrderScreen.js',
            'point_of_sale/static/src/js/Misc/AbstractReceiptScreen.js',
            'point_of_sale/static/src/js/Misc/SearchBar.js',
            'point_of_sale/static/src/js/ChromeWidgets/DebugWidget.js',
            'point_of_sale/static/src/js/Popups/AbstractAwaitablePopup.js',
            'point_of_sale/static/src/js/Popups/ErrorPopup.js',
            'point_of_sale/static/src/js/Popups/ErrorBarcodePopup.js',
            'point_of_sale/static/src/js/Popups/ConfirmPopup.js',
            'point_of_sale/static/src/js/Popups/CashMovePopup.js',
            'point_of_sale/static/src/js/Popups/TextInputPopup.js',
            'point_of_sale/static/src/js/Popups/TextAreaPopup.js',
            'point_of_sale/static/src/js/Popups/ErrorTracebackPopup.js',
            'point_of_sale/static/src/js/Popups/SelectionPopup.js',
            'point_of_sale/static/src/js/Popups/EditListInput.js',
            'point_of_sale/static/src/js/Popups/EditListPopup.js',
            'point_of_sale/static/src/js/Popups/NumberPopup.js',
            'point_of_sale/static/src/js/Popups/OfflineErrorPopup.js',
            'point_of_sale/static/src/js/Popups/OrderImportPopup.js',
            'point_of_sale/static/src/js/Popups/ProductConfiguratorPopup.js',
            'point_of_sale/static/src/js/Popups/CashOpeningPopup.js',
            'point_of_sale/static/src/js/Popups/ProductInfoPopup.js',
            'point_of_sale/static/src/js/Screens/ProductScreen/ControlButtons/OrderlineCustomerNoteButton.js',
            'point_of_sale/static/src/js/Popups/ClosePosPopup.js',
            'point_of_sale/static/src/js/Screens/ProductScreen/ControlButtons/SetPricelistButton.js',
            'point_of_sale/static/src/js/Screens/ProductScreen/ControlButtons/SetFiscalPositionButton.js',
            'point_of_sale/static/src/js/Screens/ProductScreen/ControlButtons/ProductInfoButton.js',
            'point_of_sale/static/src/js/Screens/ProductScreen/ControlButtons/RefundButton.js',
            'point_of_sale/static/src/js/ChromeWidgets/ClientScreenButton.js',
            'point_of_sale/static/src/js/Misc/NumberBuffer.js',
            'point_of_sale/static/src/js/Misc/MobileOrderWidget.js',
            'point_of_sale/static/src/js/Notification.js',
        ],
        'web.assets_backend': [
            'point_of_sale/static/src/scss/pos_dashboard.scss',
            'point_of_sale/static/src/js/tours/point_of_sale.js',
            'point_of_sale/static/src/js/debug_manager.js',
            'point_of_sale/static/src/js/web_overrides/pos_config_form.js',
        ],
        'point_of_sale.pos_assets_backend': [
            ('include', 'web.assets_backend'),
            ('remove', 'web/static/src/core/errors/error_handlers.js'),
            ('remove', 'web/static/src/legacy/legacy_rpc_error_handler.js'),
        ],
        'point_of_sale.pos_assets_backend_style': [
            "web/static/src/core/ui/**/*.scss",
        ],
        'point_of_sale.tests_assets': [
            'web/static/lib/daterangepicker/daterangepicker.css',
            'web/static/lib/qunit/qunit-2.9.1.css',
            'web/static/lib/qunit/qunit-2.9.1.js',
            'web/static/tests/legacy/helpers/**/*',
            ('remove', 'web/static/tests/legacy/helpers/test_utils_tests.js'),

            'web/static/tests/legacy/legacy_setup.js',

            'web/static/tests/helpers/**/*.js',
            'web/static/tests/qunit.js',
            'web/static/tests/main.js',
            'web/static/tests/setup.js',

            # These 2 lines below are taken from web.assets_frontend
            # They're required for the web.frontend_legacy to work properly
            # It is expected to add other lines coming from the web.assets_frontend
            # if we need to add more and more legacy stuff that would require other scss or js.
            ('include', 'web._assets_helpers'),
            'web/static/lib/bootstrap/scss/_variables.scss',

            ('include', 'web.frontend_legacy'),
        ],
        'point_of_sale.qunit_suite_tests': [
            'web/static/tests/legacy/component_extension_tests.js',
            'point_of_sale/static/tests/unit/**/*',
        ],
        'point_of_sale.assets_backend_prod_only': [
            'point_of_sale/static/src/js/chrome_adapter.js',
            'point_of_sale/static/src/js/main.js',
            'web/static/src/start.js',
            'web/static/src/legacy/legacy_setup.js',
        ],
        'web.assets_qweb': [
            'point_of_sale/static/src/xml/**/*',
        ],
    },
    'license': 'LGPL-3',
}
