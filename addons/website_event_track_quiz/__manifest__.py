# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.


{
    'name': 'Quizzes on Tracks',
    'category': 'Marketing/Events',
    'sequence': 1007,
    'version': '1.0',
    'summary': 'Quizzes on tracks',
    'website': 'https://www.odoo.com/page/events',
    'description': "",
    'depends': [
        'website_event_track_session',
    ],
    'data': [
        'security/ir.model.access.csv',
        'views/assets.xml',
        'views/event_quiz_views.xml',
        'views/event_quiz_question_views.xml',
        'views/event_track_views.xml',
        'views/event_menus.xml',
        'views/event_quiz_templates.xml',
        'views/event_track_templates_page.xml',
    ],
    'demo': [
        'data/quiz_demo.xml',
    ],
    'application': False,
    'installable': True,
}
