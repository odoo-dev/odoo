# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Report Engine WEB',
    'version': '1.0',
    'category': 'technical/reports',
    'summary': 'data module for the report engine',
    'description': """
This module adds the reports internal templates to odoo.
    """,
    'depends': [
        'base_report_engine',
        'base_setup',
        'web',
    ],
    'data': [
        'views/ir_actions_report_views.xml',
        'views/res_config_settings_views.xml',
    ],
    'installable': True,
    'auto_install': True,
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
