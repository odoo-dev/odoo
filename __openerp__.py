# -*- coding: utf-8 -*-
{
    'name': 'Argentina - Planes Contables',
    'author': 'Moldeo Interactive,ADHOC SA',
    'category': 'Localization/Account Charts',
    'license': 'AGPL-3',
    'depends': [
        # for afip_code on fiscal position and other tax modifications
        'l10n_ar_account',
        # this is not a real dependency but it is a depedency for demo data
        # and, in fact, we always installe afipws_fe, so for now we force this
        # depedency
        'l10n_ar_afipws_fe',
        'account_withholding',
        'account_check',
    ],
    'test': [],
    'data': [
        'data/account_chart_base.xml',
        'data/account_chart_template.xml',
        'data/account_chart_respinsc.xml',
        'data/account_tax_template.xml',
        'data/account_tax_withholding_template.xml',
        'data/account_fiscal_template.xml',
        'data/account_chart_template.yml',
    ],
    'demo': [
        # TODO los productos se podrian cargar directamente en l10n_ar_account
        '../l10n_ar_account/demo/product_product_demo.xml',
        '../l10n_ar_account/demo/account_customer_invoice_demo.yml',
        '../l10n_ar_account/demo/account_customer_expo_invoice_demo.yml',
        '../l10n_ar_account/demo/account_customer_invoice_validate_demo.yml',
        '../l10n_ar_account/demo/account_customer_refund_demo.yml',
        '../l10n_ar_account/demo/account_supplier_invoice_demo.yml',
        '../l10n_ar_account/demo/account_supplier_refund_demo.yml',
        # todo ver si usamos esto o un demo con el de groups
        # '../l10n_ar_account/demo/account_payment_demo.yml',
        '../l10n_ar_account/demo/account_other_docs_demo.yml',
        # we add this file only fot tests run by odoo
        '../l10n_ar_account/demo/account_journal_demo.xml',
        # '../account/demo/account_bank_statement.yml',
        # '../account/demo/account_invoice_demo.yml',
        # electronic invoice demo data
        '../l10n_ar_afipws_fe/demo/account_journal_expo_demo.yml',
        '../l10n_ar_account/demo/account_customer_expo_invoice_demo.yml',
        '../l10n_ar_afipws_fe/demo/account_journal_demo.yml',
        '../l10n_ar_account/demo/account_customer_invoice_demo.yml',
        '../l10n_ar_afipws_fe/demo/account_journal_demo_without_doc.yml',
    ],
    'installable': True,
    'images': [
    ],
    'version': '9.0.1.0.0',
}
