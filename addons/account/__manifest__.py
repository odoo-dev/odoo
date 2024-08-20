# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': 'Invoicing',
    'version': '1.3',
    'summary': 'Invoices, Payments, Follow-ups & Bank Synchronization',
    'sequence': 10,
    'description': """
Invoicing & Payments
====================
The specific and easy-to-use Invoicing system in Odoo allows you to keep track of your accounting, even when you are not an accountant. It provides an easy way to follow up on your vendors and customers.

You could use this simplified accounting in case you work with an (external) account to keep your books, and you still want to keep track of payments. This module also offers you an easy method of registering payments, without having to encode complete abstracts of account.
    """,
    'category': 'Accounting/Accounting',
    'website': 'https://www.odoo.com/app/invoicing',
    'depends': ['base_setup', 'product', 'analytic', 'portal', 'digest'],
    'data': [
        'security/account_security.xml',
        'security/ir.model.access.csv',
        'data/account_data.xml',
        'data/digest_data.xml',
        'views/account_report.xml',
        'data/mail_template_data.xml',
        'views/account_payment_view.xml',
        'wizard/account_automatic_entry_wizard_views.xml',
        'wizard/account_autopost_bills_wizard.xml',
        'wizard/account_unreconcile_view.xml',
        'wizard/account_move_reversal_view.xml',
        'wizard/account_resequence_views.xml',
        'wizard/account_payment_register_views.xml',
        'views/account_move_views.xml',
        'wizard/setup_wizards_view.xml',
        'views/account_account_views.xml',
        'views/account_group_views.xml',
        'views/account_journal_views.xml',
        'views/account_account_tag_views.xml',
        'views/account_bank_statement_views.xml',
        'views/account_reconcile_model_views.xml',
        'views/account_tax_views.xml',
        'views/account_full_reconcile_views.xml',
        'views/account_payment_term_views.xml',
        'views/account_payment_method.xml',
        'views/res_partner_bank_views.xml',
        'views/report_statement.xml',
        'views/terms_template.xml',
        'wizard/account_validate_move_view.xml',
        'views/res_company_views.xml',
        'views/product_view.xml',
        'views/account_analytic_plan_views.xml',
        'views/account_analytic_account_views.xml',
        'views/account_analytic_distribution_model_views.xml',
        'views/account_analytic_line_views.xml',
        'views/report_invoice.xml',
        'report/account_invoice_report_view.xml',
        'views/account_cash_rounding_view.xml',
        'views/ir_actions_views.xml',
        'views/ir_module_views.xml',
        'views/res_config_settings_views.xml',
        'views/partner_view.xml',
        'views/account_journal_dashboard_view.xml',
        'views/account_portal_templates.xml',
        'views/report_payment_receipt_templates.xml',
        'data/service_cron.xml',
        'views/account_incoterms_view.xml',
        'data/account_incoterms_data.xml',
        'views/digest_views.xml',
        'wizard/account_move_send_views.xml',
        'report/account_hash_integrity_templates.xml',
        'views/res_currency.xml',
        'views/account_menuitem.xml',
        'views/mail_message_views.xml',
        'wizard/accrued_orders.xml',
        'views/bill_preview_template.xml',
        'data/account_reports_data.xml',
        'views/uom_uom_views.xml',
        'views/product_views.xml',
        'views/tests_shared_js_python.xml',
        'views/base_document_layout_views.xml',
        'views/account_lock_exception_views.xml',
        'views/report_templates.xml'
    ],
    'demo': [
        'demo/account_demo.xml',
    ],
    'installable': True,
    'application': True,
    'post_init_hook': '_account_post_init',
    'assets': {
        'web._assets_primary_variables': [
            'account/static/src/scss/variables.scss',
        ],
        'web.assets_backend': [
            'account/static/src/css/account_bank_and_cash.css',
            'account/static/src/css/account.css',
            'account/static/src/css/account_payment.scss',
            'account/static/src/scss/account_journal_dashboard.scss',
            'account/static/src/scss/account_searchpanel.scss',
            'account/static/src/scss/account_payment_term.scss',
            'account/static/src/scss/account_reconcile_model.scss',
            'account/static/src/scss/account_multi_ledger.scss',
            'account/static/src/components/**/*',
            'account/static/src/services/*.js',
            'account/static/src/views/*.js',
            'account/static/src/js/tours/account.js',
            'account/static/src/js/search/search_bar/search_bar.js',
            'account/static/src/helpers/*.js',
            'account/static/src/core/utils/*.js',
        ],
        # Unit test files
        'web.assets_unit_tests': [
            'account/static/tests/**/*',
            ('remove', 'account/static/tests/legacy/**/*'),  # to remove when all legacy tests are ported
            ('remove', 'account/static/tests/helpers/**/*'),
            ('remove', 'account/static/tests/tours/**/*'),
        ],
        'web.assets_frontend': [
            'account/static/src/js/account_portal_sidebar.js',
            'account/static/src/js/account_portal.js',
            'account/static/src/components/tests_shared_js_python/*',
            'account/static/src/helpers/*.js',
            'account/static/src/core/utils/*.js',
        ],
        'web.assets_tests': [
            'account/static/tests/tours/**/*',
        ],
        'web.qunit_suite_tests': [
            'account/static/tests/helpers/*.js',
            'account/static/tests/legacy/*.js',
        ],
        'web.report_assets_common': [
            'account/static/src/css/report_invoice.css',
        ],
        'web.report_assets_pdf': [
            'account/static/src/css/report_invoice.css',
        ],
    },
    'license': 'LGPL-3',
}
