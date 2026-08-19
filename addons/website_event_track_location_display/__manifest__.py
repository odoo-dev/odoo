{
    'name': 'Event Location Display',
    'category': 'Marketing/Events',
    'website': 'https://www.odoo.com/app/events',
    'summary': 'Dedicated live schedule screens for event locations',
    'depends': ['website_event_track'],
    'data': [
        'views/event_track_location_views.xml',
        'views/event_track_location_display_templates.xml',
    ],
    'assets': {
        'web.assets_frontend': [
            'website_event_track_location_display/static/src/**/*',
        ],
        'web.assets_tests': [
            'website_event_track_location_display/static/tests/tours/*.js',
        ],
    },
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
