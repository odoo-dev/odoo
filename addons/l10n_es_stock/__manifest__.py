# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': "Spain - Stock",
    'category': 'Stock',
    'depends': [
        'sale', 'account', 'l10n_es', 'pos_stock'
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'l10n_es_stock/static/src/app/models/*',
        ],
    },
    'auto_install': True,
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
