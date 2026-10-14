# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': "POS Self Order Geolocalize",
    'summary': "Delivery distance check in the Self Order App",
    'category': 'Sales/Point of Sale',
    'depends': ['pos_self_order', 'base_geolocalize'],
    'auto_install': True,
    'data': [
        'views/pos_preset_views.xml',
    ],
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
