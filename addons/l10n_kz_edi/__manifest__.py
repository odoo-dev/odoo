# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': 'Kazakhstan - E-Invoicing',
    'website': 'https://www.odoo.com/documentation/latest/applications/finance/fiscal_localizations.html',
    'icon': '/account/static/description/l10n.png',
    'countries': ['kz'],
    'version': '1.0',
    'category': 'Accounting/Localizations/EDI',
    'description': """
Kazakhstan E-Invoicing (ЭСФ / ESF)
==================================

Connectivity layer to the Kazakhstan Electronic Invoices System (ЭСФ) operated
by the State Revenue Committee (KGD). This module adds the configuration and the
"Test Connection" tooling that validates reachability, authentication (via
NCALayer browser-side signing) and enterprise validation against the ESF SOAP
services.
    """,
    'depends': [
        'account',
        'l10n_kz',
    ],
    'data': [
        'views/res_config_settings_views.xml',
        'views/res_users_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'l10n_kz_edi/static/src/**/*',
        ],
        'web.assets_unit_tests': [
            'l10n_kz_edi/static/tests/**/*',
        ],
    },
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
