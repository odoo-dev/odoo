{
    'name': 'Türkiye - Nilvera E-Invoice',
    'version': '1.0',
    'category': 'Accounting/Accounting',
    'description': """
For sending and receiving electronic invoices to Nilvera.
    """,
    'depends': ['l10n_tr_nilvera', 'account_edi_ubl_cii'],
    'data': [
        'security/ir.model.access.csv',
        'data/cron.xml',
        'data/res_partner_category_data.xml',
        'data/l10n_tr_nilvera_einvoice_extended.tax.office.csv',
        'data/account_incoterms_data.xml',
        'data/ubl_tr_templates.xml',
        'views/res_company_views.xml',
        'views/l10n_tr_nilvera_einvoice_extended_account_tax_code_views.xml',
        'views/l10n_tr_nilvera_einvoice_extended_tax_office_views.xml',
        'views/res_partner_views.xml',
        'views/account_move_views.xml',
        'views/account_tax_views.xml',
        'views/product_views.xml',
        'views/res_config_settings_views.xml',
    ],
    'auto_install': ['l10n_tr_nilvera'],
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
