{
    'name': 'Point of Sale Reports Printing',
    'category': 'Sales/Point of Sale',
    'summary': 'Print Point of Sale reports on printers',
    'description': """
This module sends Point of Sale reports to the printers linked to their report action.
""",
    'depends': ['point_of_sale', 'printer'],
    'auto_install': True,
    'data': [
        'data/pos_report_reports.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'printer_pos/static/src/**/*',
        ],
    },
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
