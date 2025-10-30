# -*- coding: utf-8 -*-
{
    'name': 'Call Debrief',
    'version': '1.0',
    'category': 'Productivity',
    'summary': 'Reusable widget and model for call debrief artifacts.',
    'description': """
        Provides a generic call.artifact model and a reusable frontend widget
        for displaying call debrief information (video, audio, transcript, timeline).
    """,
    'depends': ['web'],
    'data': [
        'security/ir.model.access.csv',
    ],
    'assets': {
        'web.assets_backend': [
            'call_debrief/static/src/**/*',
        ],
    },
    'installable': True,
    'auto_install': False,
    'license': 'LGPL-3',
    'author': 'Odoo S.A.',
}
