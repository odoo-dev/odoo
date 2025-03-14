# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Saudi Arabia - E-invoicing',
    'countries': ['sa'],
    'version': '0.1',
    'depends': [
        'l10n_sa_edi',
    ],
    'author': 'Odoo S.A',
    'summary': "E-Invoicing, Universal Business Language",
    'description': """
Allows the support for Branches and VAT Groups
    """,
    'category': 'Accounting/Localizations/EDI',
    'license': 'LGPL-3',
    'data': [
        'security/ir.model.access.csv',

        'views/account_journal_views.xml',
        'views/l10n_sa_vat_group_views.xml',
        'views/res_company_views.xml'
    ],
}
