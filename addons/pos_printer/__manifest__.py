{
    'name': 'POS Printer',
    'version': '1.0',
    'category': 'Sales/Point of Sale',
    'sequence': 6,
    'summary': 'ePOS Printers in PoS',
    'description': """
        Use ePOS Printers without the IoT Box in the Point of Sale
        """,
    'depends': ['point_of_sale'],
    'data': [
        'security/ir.model.access.csv',
        'views/pos_config_views.xml',
        'views/usb_printer_wizard_view.xml',
        'views/res_config_settings_views.xml',
        'views/pos_printer_views.xml',
    ],
    'installable': True,
    'auto_install': True,
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_printer/static/src/**/*',
        ],
    },
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
