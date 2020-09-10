# -*- encoding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
# Copyright 2015 Eezee-It

{
    'name': 'Worldline SIPS',
    'version': '2.0',
    'author': 'Eezee-It',
    'category': 'Accounting/Payment Acquirers',
    'sequence': 385,
    'description': """
Worldline SIPS Payment Acquirer for online payments

Implements the Worldline SIPS API for payment acquirers.
Other SIPS providers may be compatible, though this is
not guaranteed.""",
    'depends': ['payment'],
    'data': [
        'views/payment_views.xml',
        'views/payment_sips_templates.xml',
        'data/payment_acquirer_data.xml',
    ],
    'application': True,
    'post_init_hook': 'create_missing_journals',
    'uninstall_hook': 'uninstall_hook',
}
