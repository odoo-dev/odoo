{
    'name': 'Spain - IRPF withholding rate per partner',
    'version': '1.0',
    'countries': ['es'],
    'category': 'Accounting/Localizations',
    'summary': 'Apply a personal IRPF withholding rate to salary withholding taxes',
    'description': """not alter existing entries.""",
    'depends': ['l10n_es'],
    'auto_install': True,
    'data': [
        'views/account_views.xml',
        'views/partner_view.xml',
    ],
    'post_init_hook': '_post_init_hook',
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}