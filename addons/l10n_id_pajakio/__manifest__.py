# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Integration with PajakIO',
    'icon': '/account/static/description/l10n.png',
    'version': '1.0',
    'description': """
    """,
    'category': 'Accounting/Localizations/EDI',
    'depends': ['l10n_id_efaktur_coretax'],
    'data': [
        # 'data/ir_cron.xml',
        'views/res_config_settings_views.xml',
        'views/account_move.xml',
        'views/efaktur_document.xml',
    ],
    'installable': True,
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}

