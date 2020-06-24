# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.


{
    'name': 'Events Online',
    'category': 'Marketing/Events',
    'sequence': 1001,
    'version': '1.0',
    'summary': 'Bridge module to support Online Events',
    'website': 'https://www.odoo.com/page/events',
    'description': "",
    'depends': [
        'website_event'
    ],
    'data': [
        'views/assets.xml',
        'views/event_event_views.xml',
        'views/event_tag_views.xml',
        'views/event_templates_event.xml',
    ],
    'demo': [
        'data/event_tag_demo.xml',
    ],
    'application': False,
    'installable': True,
}
