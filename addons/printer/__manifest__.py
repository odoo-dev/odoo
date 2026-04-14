{
    "name": "Printer",
    "summary": "Base module to manage external printers (e.g. ePOS, ZPL)",
    "version": "0.1",
    "depends": ["base"],
    "author": "Odoo S.A.",
    "license": "LGPL-3",
    "data": [
        "security/ir.model.access.csv",
        "views/ir_actions_report.xml",
        "views/printer_views.xml",
        "wizard/select_printers_wizard.xml",
    ],
    'demo': [
        'demo/printers.xml'
    ],
    "assets": {
        "web.assets_backend": [
            "printer/static/src/**/*",
        ],
        'printer.assets_tests': [
            'printer/static/tests/tours/**/*',
        ],
    },
}
