{
    'name': 'Uzbekistan - Tax Regimes',
    'icon': '/account/static/description/l10n.png',
    'description': """
Uzbekistan tax regimes
======================

Adds the company Tax Regime setting (Standard VAT 12%, Simplified VAT 6% or
Turnover Income Taxation) and the turnover income tax rate. Switching the regime
sets the default taxes and activates only the taxes of that regime.
    """,
    'category': 'Accounting/Localizations',
    'depends': [
        'l10n_uz',
    ],
    'data': [
        'views/res_config_settings_views.xml',
    ],
    'auto_install': True,
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
