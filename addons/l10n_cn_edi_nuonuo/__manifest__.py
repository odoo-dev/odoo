# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': 'China - E-Fapiao (Nuonuo)',
    'countries': ['cn'],
    'category': 'Accounting/Localizations/EDI',
    'icon': '/account/static/description/l10n.png',
    'summary': "Issue e-Fapiao through Nuonuo 诺税通",
    'description': """
Connects the Chinese e-Fapiao flow to Nuonuo's 诺税通 platform.

Each company uses its own Nuonuo app (自用型): create it on open.nuonuo.com with a
permanent token, then enter its appKey, appSecret and token in the Accounting settings.
    """,
    'depends': ['l10n_cn_edi'],
    'data': [
        'security/ir.access.csv',
        'views/res_config_settings_views.xml',
        'wizard/l10n_cn_edi_nuonuo_login_views.xml',
    ],
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
