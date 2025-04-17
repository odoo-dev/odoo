{
    'name': 'Base Printer',
    'version': '1.0',
    'category': 'Hardware Printer',
    'sequence': 6,
    'summary': 'Manage printers without IoT Box',
    'description': """
Base Printer module to connect and manage various printers like Epson directly, without requiring an IoT Box.
Ideal for POS and self-ordering systems.
""",
    'depends': ['mail', 'product'],
    'data': [
        'data/report_print_mail_template_data.xml',
        'security/ir.model.access.csv',
        'views/ir_actions_views.xml',
        'views/report_printer_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'base_printer/static/src/backend/printer_report_action.js',
        ],
        'web.assets_unit_tests': [
            'base_printer/static/src/epson_printer/utils/utils.js',
            'base_printer/static/src/epson_printer/utils/html-to-image.js',
            'base_printer/static/src/epson_printer/services/render_service.js',
            'base_printer/static/tests/unit/**/*',
        ],

    },
    'auto_install': True,
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
