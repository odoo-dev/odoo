# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Indian - E-invoicing for Point of Sale',
    'countries': ['in'],
    'category': 'Accounting/Localizations/EDI',
    'summary': "Print the IRN and the signed QR code of the e-invoice on the PoS receipt",
    'depends': [
        'l10n_in_pos',
        'l10n_in_edi',
    ],
    'data': [
        'receipt/pos_order_receipt.xml',
    ],
    'auto_install': True,
    'assets': {
        'point_of_sale._assets_pos': [
            'l10n_in_pos_edi/static/src/**/*',
        ],
    },
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
