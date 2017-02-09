# -*- coding: utf-8 -*-
{
    "name": "Accounting Documents Management",
    "version": "9.0.1.4.0",
    "author": "Moldeo Interactive,ADHOC SA",
    "license": "AGPL-3",
    "category": "Accounting",
    "depends": [
        "account",
        "base_validator",
    ],
    "data": [
        'view/account_journal_view.xml',
        'view/account_move_line_view.xml',
        'view/account_move_view.xml',
        'view/account_document_type_view.xml',
        'view/account_invoice_view.xml',
        'view/res_company_view.xml',
        'view/res_partner_view.xml',
        'view/report_invoice.xml',
        'view/account_chart_template_view.xml',
        'view/account_payment_view.xml',
        'view/account_payment_receiptbook_view.xml',
        'wizards/account_journal_merge_wizard_view.xml',
        'report/invoice_report_view.xml',
        'data/account.document.type.csv',
        'data/mail_template_invoice.xml',
        'wizards/account_invoice_refund_view.xml',
        'res_config_view.xml',
        'security/ir.model.access.csv',
        'security/security.xml',
    ],
    "demo": [
    ],
    'images': [
    ],
    'installable': True,
}
