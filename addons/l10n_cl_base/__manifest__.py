{
    'name': 'Base for Chilean Localization',
    'version': '1.0.0',
    'category': 'Localization',
    'sequence': 10,
    'author': 'Blanco Martin & Asociados',
    'description': """
Base Module for Chilean Localization
=====================================
* Activate CLP, currency and UF and UTM indexes as currency.
    """,
    'depends': [
        'contacts',
        'base_vat',
    ],
    'data': [
        'data/l10n_cl_identification_type_data.xml',
        'data/res.bank.csv',
        'data/res_country_data.xml',
        'data/res.currency.csv',
        'views/l10n_cl_identification_type_view.xml',
        'views/res_bank_view.xml',
        'views/res_company_view.xml',
        'views/res_country_view.xml',
        'views/res_partner_view.xml',
        'security/ir.model.access.csv',
    ],
    'installable': True,
    'auto_install': False,
    'application': False,
    'demo': [
        # 'demo/partner_demo.xml',
    ],
}