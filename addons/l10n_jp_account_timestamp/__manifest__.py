# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': 'Japan - Accounting Scanned Documents',
    'category': 'Accounting/Localizations',
    'summary': 'Preserve scans and prepare PDF evidence for Japanese Accounting',
    'description': 'Register original accounting scans, preserve replacements, and prepare PDF fingerprints.',
    'depends': [
        'account',
        'iap',
        'l10n_jp',
    ],
    'data': [
        'security/ir.access.csv',
        'data/iap_service_data.xml',
        'data/ir_cron_data.xml',
        'views/l10n_jp_account_document_version_views.xml',
        'views/account_move_views.xml',
        'views/res_config_settings_views.xml',
    ],
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
    'application': False,
    'installable': True,
}
