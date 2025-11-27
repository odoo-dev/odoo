# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': "mass_mailing_hr",
    'summary': "HR/Mass Mailing Link Module for specific action views",
    'category': 'Marketing/Email Marketing',
    'version': '0.1',
    'depends': ['mass_mailing', 'hr'],
    'assets': {
        'web.assets_backend': [
            'mass_mailing_hr/static/src/editor/**/*',
        ],
    },
    'auto_install': True,
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
