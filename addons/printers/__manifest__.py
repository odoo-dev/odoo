{
    'name': 'Printer Service',
    'category': 'Tool/Printer Service',
    'sequence': 7,
    'summary': 'A printer service',
    'data': [
        'security/ir.model.access.csv',
        'security/printers_security.xml',
        'views/printers.xml',
        'views/ir_actions_report.xml',
        'wizard/select_printer_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'printers/static/src/**/*',
        ],
    },
    'depends': ['base', 'web'],
    'author': 'Odoo India Pvt Ltd',
    'license': 'LGPL-3',
}
