# -*- coding: utf-8 -*-
{
    # TODO: add a description
    'name': "pos_self_order",

    'summary': """
        Addon for the POS App that allows customers to view the menu on their smartphone.
        """,

    'description': """
    
    """,

    'author': "My Company",
    'website': "https://www.yourcompany.com",

    'category': 'Uncategorized',
    'version': '0.1',

    'depends': ['pos_restaurant'],

    # always loaded
    'data': [
        'security/ir.model.access.csv',
        'views/index.xml',
        'views/qr_code.xml',    
        'views/custom_link_views.xml',
        'views/res_config_settings_views.xml',
    ],
    'installable': True,
    'assets': {    
        'pos_self_order.assets_self_order': [
            ('include', 'web._assets_helpers'),
            ('include', 'web._assets_backend_helpers'),
            ('include', 'web._assets_primary_variables'),
            'web/static/src/scss/pre_variables.scss',
            'web/static/lib/bootstrap/scss/_functions.scss',
            'web/static/lib/bootstrap/scss/_variables.scss',
            ('include', 'web._assets_bootstrap'),
            'web/static/src/boot.js',
            'web/static/src/legacy/js/promise_extension.js',  # Legacy FIXME
            'web/static/src/env.js',
            'web/static/src/session.js',
            'web/static/src/core/utils/transitions.scss',
            'web/static/src/core/**/*',
            'web/static/src/webclient/company_service.js',
            'web/static/lib/owl/owl.js',
            'web/static/lib/owl/odoo_module.js',
            'web/static/lib/luxon/luxon.js',

            'web/static/src/views/fields/formatters.js',
            'web/static/src/libs/fontawesome/css/font-awesome.css',


            'pos_self_order/static/src/**/*',
            'point_of_sale/static/src/utils.js',
        ],
    }

}
