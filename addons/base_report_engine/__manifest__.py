# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': "Report Engine: base report engine",
    'summary': "Base report engine",
    'version': '1.0',
    'category': 'technical/reports',
    'description': """
This module provides the base for report engine for Odoo.
it's made to be extended by other modules to provide
pdf and image rendering engines.

This module does not provide any rendering engine by itself.
n.b.: for odoo 19.0 and before this was included in the base module.
    """,
    'auto_install': True,
    'installable': True,
    'depends': [
        'base_setup',
    ],
    'data': [
        'views/ir_model_reports.xml',
        'views/ir_module_reports.xml',
        'views/res_config_settings_views.xml',
    ],
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
