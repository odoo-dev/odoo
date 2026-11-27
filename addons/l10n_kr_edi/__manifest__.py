# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': "Republic of Korea - E-invoicing",
    'icon': '/account/static/description/l10n.png',
    'countries': ['kr'],
    'category': 'Accounting/Localizations/EDI',
    'summary': "E-invoicing using Barobill",
    'description': """
Republic of Korea - E-invoicing
===============================
This module allows the user to issue electronic tax invoices to the NTS through Barobill.
    """,
    'depends': ['l10n_kr', 'account_debit_note'],
    'data': [
        'security/ir.access.csv',
        'data/ir_cron.xml',
        'views/account_move_views.xml',
        'views/res_config_settings_views.xml',
        'views/res_partner_views.xml',
        'views/res_company_views.xml',
        'wizard/account_move_reversal_views.xml',
    ],
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
