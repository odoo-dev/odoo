# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Homeworking',
    'version': '1.0',
    'category': 'Human Resources/Homeworking',
    'depends': ['hr', 'calendar'],
    'data': [
        'security/security.xml',
        'security/ir.model.access.csv',
        'views/hr_employee_views.xml',
        'views/hr_homeworking_views.xml',
        'views/res_users.xml',
        'wizard/calendar_popover_delete_wizard_homework.xml',
    ],
    'demo': [
        'data/hr_homeworking_demo.xml',
    ],
    'installable': True,
    'assets': {
        'web.assets_backend': [
            'hr_homeworking/static/src/**/*',
        ],
        'web.qunit_suite_tests': [
            'hr_homeworking/static/tests/**/*',
        ],
    },
    'license': 'LGPL-3',
}
