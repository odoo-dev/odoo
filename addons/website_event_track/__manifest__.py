# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Advanced Events',
    'category': 'Marketing',
    'summary': 'Sponsors, Tracks, Agenda, Event News',
    'version': '1.2',
    'description': "",
    'depends': ['website_event'],
    'data': [
        'security/ir.model.access.csv',
        'security/event_track_security.xml',
        'data/event_data.xml',
        'data/mail_data.xml',
        'data/mail_template_data.xml',
        'data/event_track_data.xml',
        'views/mail_templates.xml',
        'views/event_templates.xml',
        'views/event_track_templates_agenda.xml',
        'views/event_track_templates_list.xml',
        'views/event_track_templates_reminder.xml',
        'views/event_track_templates_page.xml',
        'views/event_track_templates_proposal.xml',
        'views/website_templates.xml',
        'views/event_track_views.xml',
        'views/event_track_location_views.xml',
        'views/event_track_tag_views.xml',
        'views/event_track_stage_views.xml',
        'views/event_track_visitor_views.xml',
        'views/event_event_views.xml',
        'views/event_type_views.xml',
        'views/res_config_settings_view.xml',
        'views/website_visitor_views.xml',
        'views/event_menus.xml',
    ],
    'demo': [
        'data/event_demo.xml',
        'data/event_track_location_demo.xml',
        'data/event_track_tag_demo.xml',
        'data/event_track_demo.xml',
        'data/event_track_demo_description.xml',
        'data/event_track_visitor_demo.xml',
    ],
    'assets': {
        'web.assets_frontend': [
            # after //link[last()]
            'website_event_track/static/src/scss/event_track_templates.scss',
            # after //link[last()]
            'website_event_track/static/src/scss/event_track_templates_online.scss',
            # after //link[last()]
            'website_event_track/static/src/scss/pwa_frontend.scss',
            # after //script[last()]
            'website_event_track/static/src/js/website_event_track.js',
            # after //script[last()]
            'website_event_track/static/src/js/event_track_reminder.js',
            # after //script[last()]
            'website_event_track/static/src/js/website_event_pwa_widget.js',
            # after //script[last()]
            'website_event_track/static/lib/idb-keyval/idb-keyval.js',
        ],
    }
}
