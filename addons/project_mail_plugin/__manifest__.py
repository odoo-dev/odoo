# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Project Mail Plugin',
    'version': '1.0',
    'category': 'Services/Project',
    'sequence': 5,
    'summary': 'Turn emails received in your mailbox into tasks and log their content as internal notes.',
    'description': "Turn emails received in your mailbox into tasks and log their content as internal notes.",
    'data': [
        'views/project_task_views.xml'
    ],
    'website': 'https://www.odoo.com/app/project',
    'web.assets_backend': [
        'project_mail_plugin/static/src/to_translate/**/*',
    ],
    'depends': [
        'project',
        'mail_plugin',
    ],
    'installable': True,
    'application': False,
    'auto_install': True
}
