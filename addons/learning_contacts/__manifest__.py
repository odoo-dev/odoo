# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Learning Mode - Contacts',
    'category': 'Hidden',
    'summary': "Lessons about customers and companies for learning mode",
    'depends': ['learning', 'contacts'],
    'assets': {
        'web.assets_backend': [
            'learning_contacts/static/src/**/*',
        ],
    },
    'auto_install': True,
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
