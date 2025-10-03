# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'United States - Accounting',
    'website': 'https://www.odoo.com/documentation/latest/applications/finance/fiscal_localizations.html',
    'icon': '/account/static/description/l10n.png',
    'countries': ['us'],
    'version': '1.0',
    'category': 'Accounting/Localizations/Account Charts',
    'description': """
    """,
    'depends': ['l10n_us', 'account'],
    'data': [
        'data/ir.model.access.csv',
        'views/res_bank_views.xml',
        'data/tax_report.xml',
        'data/uom_data.xml',
    ],
    'demo': [
        'demo/demo_company.xml',
    ],
    'installable': True,
    'auto_install': ['account'],
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
    'assets': {
        'web.assets_backend': [
            'l10n_us_account/static/src/components/**/*',
        ],
    },
}
