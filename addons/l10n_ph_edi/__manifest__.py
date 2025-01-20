# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': 'Philippines - E-invoicing',
    'countries': ['ph'],
    'version': '1.0',
    'category': 'Accounting/Localizations/EDI',
    'icon': '/account/static/description/l10n.png',
    "summary": "E-invoicing through EIS",
    'description': """
    This modules allows the user to send their invoices to the EIS system.
    """,
    'depends': ['l10n_ph'],
    'data': [
        'security/ir.model.access.csv',
        'views/res_config_settings_view.xml',
    ],
    'installable': True,
    'license': 'LGPL-3'
}
