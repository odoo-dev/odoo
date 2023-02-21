# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Employees - Mexico',
    'version': '1.0',
    'category': 'Human Resources/Employees',
    'icon': '/l10n_mx/static/description/icon.svg',
    'sequence': 120,
    'summary': 'Adds specific fields to Employees for Mexican companies.',
    'depends': ['hr'],
    'data': [
        'views/hr_employee_views.xml',
    ],
    'installable': True,
    'license': 'LGPL-3',
}
