{
    'name': 'France - PDP',
    'category': 'Accounting/Localizations/EDI',
    'website': "https://www.odoo.com/documentation/18.0/applications/finance/fiscal_localizations/france.html#PDP",
    'description': """
        - Support for the mandatory electronic invoicing in France
        - Send and receive documents via PDP network
""",
    'depends': [
        'l10n_fr_account',
        'account_peppol',
    ],
    'data': [
        'data/ir_cron.xml',
        'security/ir.model.access.csv',
        'views/account_move_views.xml',
        'views/res_config_settings_views.xml',
        'views/res_partner_views.xml',
        'wizard/pdp_registration_views.xml',
        'wizard/pdp_response_wizard_views.xml',
    ],
    'license': 'LGPL-3',
    'post_init_hook': '_post_init_pdp',
    'uninstall_hook': 'uninstall_hook',
}
