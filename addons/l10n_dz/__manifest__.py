# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Algeria - Accounting',
    'version': '1.0',
    'category': 'Accounting/Localizations/Account Charts',
    'description': """
This is the module to manage the accounting chart for Algeria in Odoo.
======================================================================
This module applies to companies based in Algeria.
""",
    'author': 'Osis',
    'depends': ['account', 'base_vat', 'l10n_multilang'],
    'data': [
        'data/account_chart_template_data.xml',
        'data/account.account.template.csv',
        'data/account.group.template.csv',
        'data/account_chart_template_post_data.xml',
        'data/account_chart_template_configuration_data.xml',
        'data/tax_report.xml',
        'data/account_tax_group_data.xml',
        'data/account_tax_template_data.xml',
        'data/account_fiscal_position_template_data.xml',
    ],
    'demo': [
        'demo/demo_company.xml',
    ],
    'post_init_hook': 'load_translations',
    'license': 'LGPL-3',
}
