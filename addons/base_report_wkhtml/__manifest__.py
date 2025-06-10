# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': "Report Engine: wkhtmltopdf/wkhtmltoimage",
    'summary': "wkhtml rendering engine",
    'version': '1.0',
    'category': 'technical/reports',
    'description': """
This module is the implementation of the wkhtmltopdf and
wlhtmltoimage rendering engine for Odoo.
learn more about it here:
https://wkhtmltopdf.org/
    """,
    'auto_install': True,
    'installable': True,
    'depends': [
        'base_report_engine',
    ],
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
