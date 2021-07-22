# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.


{
    'name': "IAP / Mail",
    'summary': """Bridge between IAP and mail""",
    'description': """Bridge between IAP and mail""",
    'category': 'Hidden/Tools',
    'version': '1.0',
    'depends': [
        'iap',
        'mail',
    ],
    'application': False,
    'installable': True,
    'auto_install': True,
    'data': [
        'data/mail_templates.xml',
        'security/ir.model.access.csv',
        'views/res_partner_iap_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'iap_mail/static/src/js/**/*',
        ],
    },
    'license': 'LGPL-3',
}
