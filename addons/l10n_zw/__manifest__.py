# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': 'Zimbabwe - Accounting',
    'icon': '/account/static/description/l10n.png',
    'countries': ['zw'],
    'category': 'Accounting/Localizations/Account Charts',
    'description': """
This is the basic Zimbabwean localization necessary to run Odoo in ZW:
================================================================================
    - Chart of Accounts (IFRS based)
    - Taxes (VAT 15.5%, zero-rated, exempt, imports and imported services)
    - Tax Report (ZIMRA VAT 7 return)
    - Fiscal Positions
    """,
    'depends': [
        'account',
    ],
    'auto_install': ['account'],
    'data': [
        'data/account_tax_report_data.xml',
    ],
    'demo': [
        'demo/demo_company.xml',
    ],
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
