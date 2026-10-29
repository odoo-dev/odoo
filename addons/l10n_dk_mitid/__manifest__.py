{
    'name': "Denmark EDI - MitId",
    'summary': "This module is used to integrate KYC/KYB with MitId",
    'description': """
MitId is the official Denmark platform to verify a user. This module adds an integration
for MitId, to work with nemhandel.
    """,
    'category': 'Accounting/Localizations/EDI',
    'version': '1.0',
    'depends': [
        'l10n_dk_nemhandel',
    ],
    'auto_install': True,
    'data': [
        'views/res_config_settings_views.xml',
    ],
    'license': 'LGPL-3',
}
