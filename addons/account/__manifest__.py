# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name' : 'Invoicing',
    'version' : '1.1',
    'summary': 'Invoices & Payments',
    'sequence': 15,
    'description': """
Invoicing & Payments
====================
The specific and easy-to-use Invoicing system in Odoo allows you to keep track of your accounting, even when you are not an accountant. It provides an easy way to follow up on your vendors and customers.

You could use this simplified accounting in case you work with an (external) account to keep your books, and you still want to keep track of payments. This module also offers you an easy method of registering payments, without having to encode complete abstracts of account.
    """,
    'category': 'Accounting/Invoicing',
    'website': 'https://www.odoo.com/page/billing',
    'images' : ['images/accounts.jpeg','images/bank_statement.jpeg','images/cash_register.jpeg','images/chart_of_accounts.jpeg','images/customer_invoice.jpeg','images/journal_entries.jpeg'],
    'depends' : ['base_setup', 'product', 'analytic', 'portal', 'digest'],
    'data': [
        'security/account_security.xml',
        'security/ir.model.access.csv',
        'data/data_account_type.xml',
        'data/account_data.xml',
        'data/digest_data.xml',
        'views/account_menuitem.xml',
        'views/account_payment_view.xml',
        'wizard/account_unreconcile_view.xml',
        'wizard/account_move_reversal_view.xml',
        'views/account_move_views.xml',
        'wizard/setup_wizards_view.xml',
        'views/account_view.xml',
        'views/account_report.xml',
        'data/mail_template_data.xml',
        'wizard/account_validate_move_view.xml',
        'wizard/pos_box.xml',
        'views/account_end_fy.xml',
        'views/partner_view.xml',
        'views/product_view.xml',
        'views/account_analytic_view.xml',
        'views/account_tip_data.xml',
        'views/account.xml',
        'views/report_invoice.xml',
        'report/account_invoice_report_view.xml',
        'views/account_cash_rounding_view.xml',
        'wizard/account_report_common_view.xml',
        'views/report_journal.xml',
        'views/tax_adjustments.xml',
        'wizard/wizard_tax_adjustments_view.xml',
        'views/res_config_settings_views.xml',
        'views/account_journal_dashboard_view.xml',
        'views/account_portal_templates.xml',
        'views/report_payment_receipt_templates.xml',
        'data/payment_receipt_data.xml',
        'views/account_onboarding_templates.xml',
        'data/service_cron.xml',
        'views/account_fiscal_year_view.xml',
        'views/account_incoterms_view.xml',
        'data/account_incoterms_data.xml',
        'views/digest_views.xml',
        'wizard/account_invoice_send_views.xml',
        'views/account_tax_report_views.xml',
    ],
    'demo': [
        'demo/account_demo.xml',
    ],
    'qweb': [
        "static/src/xml/account_reconciliation.xml",
        "static/src/xml/account_payment.xml",
        "static/src/xml/account_report_backend.xml",
        "static/src/xml/bills_tree_upload_views.xml",
        'static/src/xml/account_journal_activity.xml',
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
    'post_init_hook': '_auto_install_l10n',
}
