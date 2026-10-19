# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Learning Mode',
    'category': 'Hidden',
    'summary': "Step-by-step lessons for people who are new to Odoo",
    'description': """
Learning Mode
=============

An explicit "learning mode" for new users: short hands-on lessons played on
the real screens, a focus mode that dims what is not needed yet, practice
records that are cleaned up afterwards, and recovery when the user is lost.
""",
    'depends': ['web', 'web_tour'],
    'data': [
        'security/learning_groups.xml',
        'security/ir.access.csv',
        'views/learning_practice_card_views.xml',
        'data/learning_actions.xml',
        'views/learning_menus.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'learning/static/src/**/*',
        ],
        'web.assets_unit_tests': [
            'learning/static/tests/**/*.test.js',
        ],
        'web.assets_tests': [
            'learning/static/tests/tours/**/*',
        ],
    },
    'post_init_hook': 'post_init_hook',
    'uninstall_hook': 'uninstall_hook',
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
