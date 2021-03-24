

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
    'assets': {
        'js': [
            'static/src/**/*',
        ],
        'tests_js': [
            'static/src/actions/**/*',
            'static/src/commands/**/*',
            'static/src/components/**/*',
            'static/src/core/**/*',
            'static/src/download/**/*',
            'static/src/errors/**/*',
            'static/src/debug/**/*',
            'static/src/effects/**/*',
            'static/src/legacy/**/*',
            'static/src/localization/**/*',
            'static/src/notifications/**/*',
            'static/src/py_js/**/*',
            'static/src/services/**/*',
            'static/src/utils/**/*',
            'static/src/views/**/*',
            'static/src/webclient/**/*',
            'static/src/env.js',
            'static/tests/**/*',
        ],
        'owl_qweb': [
            'static/src/components/**/*',
            'static/src/actions/**/*',
            'static/src/commands/**/*',
            'static/src/debug/**/*',
            'static/src/effects/**/*',
            'static/src/notifications/**/*',
            'static/src/webclient/**/*',
            'static/src/errors/**/*',
            'static/src/views/**/*',
        ],
        'style': [
            'static/src/utils/**/*',
            'static/src/components/**/*',
            'static/src/actions/**/*',
            'static/src/commands/**/*',
            'static/src/debug/**/*',
            'static/src/notifications/**/*',
            'static/src/effects/**/*',
            'static/src/webclient/**/*',
            'static/src/views/**/*',
            'static/src/errors/**/*',
            'static/src/services/**/*',
        ]
    },
}
