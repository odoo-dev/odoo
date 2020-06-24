# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.


{
    'name': 'Tracks Online',
    'category': 'Marketing/Events',
    'sequence': 1003,
    'version': '1.0',
    'summary': 'Online Tracks: exhibitors, favorites, communication',
    'website': 'https://www.odoo.com/page/events',
    'description': "",
    'depends': [
        'sms',
        'website_event_online',
        'website_event_track_live',
    ],
    'data': [
    ],
    'demo': [
    ],
    'application': True,
    'installable': True,  # set to False
}
