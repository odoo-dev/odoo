# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': 'Namibia - Accounting',
    'icon': '/account/static/description/l10n.png',
    'countries': ['na'],
    'category': 'Accounting/Localizations/Account Charts',
    'description': """
This is the latest basic Namibian localisation necessary to run Odoo in NA:
================================================================================
    - a generic chart of accounts
    - NamRA / VAT 2""",
    'author': 'Odoo S.A.',
    'website': 'https://www.odoo.com/documentation/latest/applications/finance/fiscal_localizations.html',
    'depends': [
        'account',
    ],
    'auto_install': ['account'],
    'data': [
        "data/account_tax_report_data.xml"

    ],
    'demo': [
        'demo/demo_company.xml',
    ],
    'license': 'LGPL-3',
}
