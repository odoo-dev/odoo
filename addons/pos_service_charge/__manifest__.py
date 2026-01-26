{
    'name': 'POS Service Charge',
    'version': '1.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Add service charges to POS orders',
    'depends': ['pos_restaurant'],
    'data': [
        'data/product_data.xml',
        'views/res_config_settings_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_service_charge/static/src/app/models/*.js',
        ],
        'web.assets_tests': [
            'pos_service_charge/static/tests/tours/*.js',
        ],
    },
    'installable': True,
    'license': 'LGPL-3',
}
