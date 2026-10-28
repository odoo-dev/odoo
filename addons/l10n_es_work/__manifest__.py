# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': 'Spain - IRPF withholding rate per partner',
    'version': '1.0',
    'countries': ['es'],
    'category': 'Accounting/Localizations',
    'summary': 'Withholding tax for salaries using the personal IRPF rate of each partner',
    'description': """Personal IRPF withholding rate""",
    'depends': ['l10n_es', 'account'],
    'auto_install': True,
    'data': [
        'views/account_views.xml',
        'views/partner_view.xml',
    ],
    'post_init_hook': '_post_init_hook',
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
