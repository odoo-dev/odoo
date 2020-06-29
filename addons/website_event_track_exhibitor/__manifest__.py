# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.


{
    'name': 'Event Exhibitors',
    'category': 'Marketing/Events',
    'sequence': 1004,
    'version': '1.0',
    'summary': 'Event: upgrade sponsors to exhibitors',
    'website': 'https://www.odoo.com/page/events',
    'description': "",
    'depends': [
        'website_event_track_online',
    ],
    'data': [
        'security/security.xml',
        'views/assets.xml',
        'views/event_exhibitor_templates.xml',
        'views/event_exhibitor_templates_exhibitor.xml',
    ],
    'demo': [
        'data/event_demo.xml',
        'data/event_sponsor_demo.xml',
    ],
    'application': False,
    'installable': True,
}
