# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Learning Mode - Sales',
    'category': 'Hidden',
    'summary': "Lessons on documents (lines, sections, a document's life) for learning mode",
    'depends': ['learning_product', 'sale'],
    'assets': {
        'web.assets_backend': [
            'learning_sale/static/src/**/*',
        ],
    },
    'uninstall_hook': 'uninstall_hook',
    'auto_install': True,
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
