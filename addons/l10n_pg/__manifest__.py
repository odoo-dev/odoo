# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': 'Papua New Guinea - Accounting',
    'icon': '/account/static/description/l10n.png',
    'countries': ['pg'],
    'category': 'Accounting/Localizations/Account Charts',
    'description': """
    Chart of Accounts, Taxes and Fiscal Positions for Papua New Guinea.
    """,
    'website': 'https://www.odoo.com/documentation/latest/applications/finance/fiscal_localizations.html',
    'depends': [
        'l10n_account_withholding_tax',
    ],
    'data': [
        'data/account_tax_report_data.xml',
        'views/account_move_views.xml',
    ],
    'demo': [
        'demo/demo_company.xml',
    ],
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
