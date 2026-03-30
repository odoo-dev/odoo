{
    'name': 'PoS Kiosk device',
    'version': '1.0.0',
    'category': 'Sales/Point of Sale',
    'sequence': 40,
    'summary': 'Allows the use of android kiosk device.',
    'depends': ['pos_self_order'],
    'uninstall_hook': 'uninstall_hook',
    'data': [
        'data/default_config.xml',
        'security/ir.model.access.csv',
        'views/pos_self_device_config.views.xml',
        'views/pos_self_device.views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'pos_self_device/static/src/js/device_form_controller.js',
            'pos_self_device/static/src/js/uptime_widget.js',
            'pos_self_device/static/src/js/uptime_widget.xml',
        ],
    },
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
