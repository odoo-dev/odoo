

# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Wowl',
    'category': 'Hidden',
    'version': '1.0',
    'description':
        """
Odoo Web core module written in Owl.
        """,
    'depends': [
        'base',
        'web'  # LPE temporary: we call some assets defined there
    ],
    'auto_install': True,
    'data': [
        'views/templates.xml',
    ],
    'owl_qweb': [
        'static/src/components',
        'static/src/views'
    ],
    'style': [
        'static/src/utils',
        'static/src/components',
        'static/src/views',
    ]
}
