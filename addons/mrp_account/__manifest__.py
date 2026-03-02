# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Accounting - MRP',
    'category': 'Supply Chain/Manufacturing',
    'summary': 'Analytic accounting in Manufacturing',
    'description': """
Analytic Accounting in MRP
==========================

* Cost structure report

If the automated inventory valuation is active, the necessary accounting entries will be created.

""",
    'website': 'https://www.odoo.com/app/manufacturing',
    'depends': ['mrp', 'stock_account'],
    "data": [
        'security/ir.model.access.csv',
<<<<<<< Updated upstream
        "views/product_views.xml",
=======
>>>>>>> Stashed changes
        "views/mrp_production_views.xml",
        "views/analytic_account_views.xml",
        "views/account_move_views.xml",
        "views/mrp_workcenter_views.xml",
        "report/report_mrp_templates.xml",
        "wizard/mrp_wip_accounting.xml",
    ],
    'demo': [
        'data/mrp_account_demo.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'mrp_account/static/src/**/*',
        ],
    },
    'auto_install': True,
    'post_init_hook': '_configure_journals',
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
