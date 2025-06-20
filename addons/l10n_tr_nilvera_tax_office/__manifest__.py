{
    'name': 'Türkiye - Nilvera Tax Offices',
    'version': '1.0',
    'category': 'Accounting/Accounting',
    'description': """
For sending and receiving more types of electronic invoices to Nilvera.
    """,
    'depends': ['l10n_tr_nilvera_einvoice', 'contacts'],
    'data': [
        'security/ir.model.access.csv',
        'data/l10n_tr.res.tax.office.csv',
        'views/l10n_tr_res_tax_office_views.xml',
        'views/res_partner_views.xml',
    ],
    'license': 'LGPL-3',
}
