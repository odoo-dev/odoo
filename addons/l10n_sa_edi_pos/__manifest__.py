# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Saudi Arabia - E-invoicing (Simplified)',
    'author': 'Odoo S.A.',
    'countries': ['sa'],
    'version': '0.2',
    'depends': [
        'l10n_sa_pos',
        'l10n_sa_edi',
        'pos_edi_ubl',
    ],
    'summary': "ZATCA E-Invoicing, support for PoS",
    'description': """
E-invoice implementation for Saudi Arabia; Integration with ZATCA (POS)
    """,
    'category': 'Accounting/Localizations/EDI',
    'license': 'LGPL-3',
    'data': [
        'data/ir_cron.xml',
    ],
    'post_init_hook': 'post_init_hook',
    'assets': {
        'point_of_sale._assets_pos': [
            'l10n_sa_edi_pos/static/src/**/*',
        ],
    }
}
