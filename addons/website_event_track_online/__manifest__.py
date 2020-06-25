# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.


{
    'name': 'Tracks Online',
    'category': 'Marketing/Events',
    'sequence': 1003,
    'version': '1.0',
    'summary': 'Bridge module to support Online Events Tracks',
    'website': 'https://www.odoo.com/page/events',
    'description': "",
    'depends': [
        'sms',
        'website_event_online',
        'website_event_track',
    ],
    'data': [
        'security/ir.model.access.csv',
        'views/assets.xml',
        'views/event_track_templates_wishlist.xml',
        'views/event_track_templates.xml',
        'views/event_track_views.xml',
    ],
    'demo': [
        'data/event_track_demo.xml',
    ],
    'application': False,
    'installable': True,
}
