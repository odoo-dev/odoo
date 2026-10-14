# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': "POS Self Order Google Address Autocomplete",
    'summary': "Google address autocomplete and delivery distance check in the Self Order App",
    'category': 'Sales/Point of Sale',
    'depends': ['pos_self_order', 'google_address_autocomplete'],
    'auto_install': True,
    'data': [
        'views/pos_preset_views.xml',
    ],
    'assets': {
        'pos_self_order.assets': [
            'google_address_autocomplete/static/src/google_places_session.js',
            'google_address_autocomplete/static/src/address_autocomplete/google_address_autocomplete.js',
            'google_address_autocomplete/static/src/address_autocomplete/google_address_autocomplete.xml',
            'google_address_autocomplete/static/src/address_autocomplete/google_address_autocomplete.css',
            'web/static/src/core/autocomplete/*',
            'web/static/src/views/fields/char/*',
            'web/static/src/views/fields/translation/*',
            'web/static/src/views/fields/dynamic_placeholder_hook.js',
            'web/static/src/views/fields/dynamic_placeholder_popover.*',
            'web/static/src/views/fields/allowed_qweb_expressions_plugin.js',
            'web/static/src/views/fields/standard_field_props.js',
            'web/static/src/views/fields/input_field_hook.js',
            'web/static/src/core/model_field_selector/model_field_selector_popover.js',
            'web/static/src/core/model_field_selector/model_field_selector_popover.xml',
            'web/static/src/core/model_field_selector/model_field_selector_popover.scss',
            'pos_self_order_google_address_autocomplete/static/src/**/*',
        ],
        'web.assets_unit_tests_setup': [
            # Same as pos_self_order: its CSS makes html_editor tests fail
            ('remove', 'pos_self_order_google_address_autocomplete/static/src/**/*.css'),
        ],
        'pos_self_order.assets_tests': [
            'pos_self_order_google_address_autocomplete/static/tests/tours/**/*',
        ],
    },
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
