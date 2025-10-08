# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': 'Myanmar - Accounting',
    'icon': '/account/static/description/l10n.png',
    'countries': ['mm'],
    'version': '1.0',
    'category': 'Accounting/Localizations/Account Charts',
    'description': ' This is the base module to manage chart of accounting and localization for Myanmar ',
    'depends': [
        'account_qr_code_emv',
        'account',
    ],
    'data': [
        'views/res_bank_views.xml',
    ],
    'auto_install': ['account'],
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
