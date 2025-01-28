# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'ESG Project',
    'version': '1.0',
    'summary': "Create a project for Carbon Reduction and calculate the emissions saved through the implemented initiatives.",
    'depends': [
        'esg',
        'project',
    ],
    'data': [
        'data/project_data.xml',
        'views/project_project_views.xml',
        'views/project_task_views.xml',
        'views/esg_menus.xml',
    ],
    'auto_install': True,
    'license': 'LGPL-3',
}
