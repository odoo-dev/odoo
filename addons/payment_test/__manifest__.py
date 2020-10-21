# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': 'Test Payment Acquirer',
    'version': '2.0',
    'category': 'Hidden',
    'description': """
This module adds a simple payment acquirer allowing to make test payments.
It should never be used in production environment. Make sure to disable it before going live.
""",
    'depends': ['payment'],
    'data': [
        'views/assets.xml',
        'views/payment_test_templates.xml',
        'views/payment_views.xml',
        'data/payment_acquirer_data.xml',
    ],
    'post_init_hook': 'post_init_hook',
    'uninstall_hook': 'uninstall_hook',
}
