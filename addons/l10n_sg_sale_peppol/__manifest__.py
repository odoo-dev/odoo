{
    'name': "Import electronic orders with PEPPOL",
    'version': '1.0',
    'category': 'Sales/Sales',
    'description': """
Receive PEPPOL UBL BIS Advanced Orders and automatically generate sale orders
    """,
    'depends': ['sale_edi_ubl', 'account_peppol', 'l10n_sg_ubl_pint'],
    'installable': True,
    'auto_install': True,
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
    'data': [
        'views/account_move_views.xml',
        'views/sale_order_views.xml',

        'security/ir.model.access.csv',
        'security/sale_peppol_advanced_order_transaction.xml',
    ],
}
