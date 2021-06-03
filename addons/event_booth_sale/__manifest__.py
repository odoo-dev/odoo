# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': "Events Booths Sales",
    'category': 'Marketing/Events',
    'version': '1.0',
    'summary': "Manage event booths sale",
    'description': """
You can now sell your event booths
    """,
    'depends': ['event_booth', 'event_sale'],
    'data': [
        'security/ir.model.access.csv',
        'data/product_data.xml',
        'views/product_views.xml',
        'views/sale_order_views.xml',
        'views/event_type_booth_views.xml',
        'views/event_booth_category_views.xml',
        # TODO: Delete this when development is finished
        'views/event_booth_registration_views.xml',
        'views/event_booth_views.xml',
        'wizard/event_booth_configurator_views.xml',
    ],
    'demo': [
        'data/event_booth_category_demo.xml',
    ],
    'auto_install': True,
    'assets': {
        'web.assets_backend': [
            'event_booth_sale/static/src/js/event_booth_configurator_form_controller.js',
            'event_booth_sale/static/src/js/event_booth_configurator_form_view.js',
            'event_booth_sale/static/src/js/event_booth_configurator_widget.js',
        ]
    }
}
