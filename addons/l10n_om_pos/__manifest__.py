# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': 'Oman - Point of Sale',
    'category': 'Accounting/Localizations/Point of Sale',
    'description': """
Oman POS Localization
===========================================================
    """,
    'license': 'LGPL-3',
    'depends': [
        'l10n_gcc_pos',
        'l10n_om',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'l10n_om_pos/static/src/**/*',
        ],
    },
    'auto_install': True,
}
