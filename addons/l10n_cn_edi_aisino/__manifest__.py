# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': 'China - E-Fapiao (Aisino Yunshui)',
    'countries': ['cn'],
    'category': 'Accounting/Localizations/EDI',
    'icon': '/account/static/description/l10n.png',
    'summary': "Issue e-Fapiao through Aisino Yunshui 爱信诺云税",
    'description': """
Connects the Chinese e-Fapiao flow to Aisino Yunshui (爱信诺云税).

Each company uses its own organization code (组织编码) and identity code (授权码),
as documented in section 7.3 of the v1.8.4 interface specification.
    """,
    'depends': ['l10n_cn_edi'],
    'data': [
        'security/ir.access.csv',
        'views/res_config_settings_views.xml',
        'wizard/l10n_cn_edi_aisino_login_views.xml',
    ],
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
