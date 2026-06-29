# -*- coding: utf-8 -*-
{
    'name': 'POS ZPL Labels',
    'version': '1.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Print ZPL labels from the POS for specific products.',
    'depends': ['point_of_sale', 'pos_iot'],
    'data': [
        'views/pos_config_view.xml',
        'views/product_view.xml',
        'receipt/pos_product_label_zpl.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_zpl_labels/static/src/**/*',
        ],
    },
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
