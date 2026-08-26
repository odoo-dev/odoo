{
    'name': 'Spain - ECommerce',
    'depends': ['l10n_es', 'website_sale'],
    'data': [
        'views/res_config_settings_views.xml',
        'views/portal_address_templates.xml',
    ],
    'assets': {
        'web.assets_frontend': [
            'l10n_es_ecommerce/static/src/js/address.js',
        ],
        'web.assets_tests': [],
    },
    'category': 'Customizations',
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
