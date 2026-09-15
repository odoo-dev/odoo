{
    'name': 'Octroi de Mer',
    'icon': '/account/static/description/l10n.png',
    'author': 'Odoo SA',
    'category': 'Accounting/Localizations/Account Charts',
    'description': """
This module introduce the french Octroi de Mer, which is a specific case for Drom.
""",
    'depends': [
        'l10n_fr_account'
    ],
    'data': [
        'views/product_template_views.xml',
    ],
    'license': 'LGPL-3',
}
