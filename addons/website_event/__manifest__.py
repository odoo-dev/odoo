# -*- coding: utf-8 -*-

{
    'name': 'Events',
    'category': 'Marketing/Events',
    'sequence': 166,
    'summary': 'Publish events, sell tickets',
    'website': 'https://www.odoo.com/page/events',
    'description': "",
    'depends': ['website', 'website_partner', 'website_mail', 'event'],
    'data': [
        'data/event_data.xml',
        'views/assets.xml',
        'views/res_config_settings_views.xml',
        'views/event_snippets.xml',
        'views/event_templates.xml',
        'views/event_views.xml',
        'security/ir.model.access.csv',
        'security/event_security.xml',
    ],
    'demo': [
        'data/res_partner_demo.xml',
        'data/event_demo.xml'
    ],
    'application': True,
}
