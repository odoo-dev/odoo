# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Democratic Republic of the Congo - Accounting',
    'countries': ['cd'],
    'category': 'Accounting/Localizations/Account Charts',
    'description': """
This module implements the tax for the Democratic Republic of the Congo.
===========================================================================

The Chart of Accounts is from SYSCOHADA.

    """,
    'depends': [
        'l10n_syscohada',
    ],
    'data': [
        'data/account_tax_report_data.xml'
    ],
    'demo': [
        'demo/demo_company.xml',
    ],
    'license': 'LGPL-3',
}
