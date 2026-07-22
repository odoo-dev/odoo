# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': 'Georgia - Electronic Invoicing',
    'countries': ['ge'],
    'version': '1.0',
    'category': 'Accounting/Localizations/EDI',
    'summary': "E-Invoicing with RS.ge, Georgia's Revenue Service",
    'description': """
Electronic invoicing for Georgia, through direct integration with RS.ge (Georgia's Revenue
Service):

- Configure RS.ge service-user credentials from Accounting Settings
- Register sales invoices with RS.ge and retrieve the official F-series/F-number
    """,
    'depends': [
        'l10n_ge',
        'account',
    ],
    "data": [
        "security/ir.access.csv",
        "views/account_move_views.xml",
        "views/res_config_settings_views.xml",
        "views/res_partner_views.xml",
        "wizard/l10n_ge_edi_k_invoice_wizard_views.xml",
    ],
    'license': 'LGPL-3',
}
