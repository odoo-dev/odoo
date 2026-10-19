# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Learning Mode - Products',
    'category': 'Hidden',
    'summary': "Lessons about products for learning mode",
    'depends': ['learning', 'product'],
    'data': [
        'data/learning_focus_override.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'learning_product/static/src/**/*',
        ],
    },
    'auto_install': True,
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
