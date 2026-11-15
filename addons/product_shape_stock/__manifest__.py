{
    'name': "Product Shapes - Inventory",
    'version': '1.0',
    'category': 'Inventory/Inventory',
    'summary': "Receive and issue pieces by size, see the pieces and weight on hand per size",
    'description': """
In the detailed operations of a receipt, a delivery or the components of a manufacturing
order, the pieces of a shaped product are entered with their size (height, length,
width) and their number. The quantity is computed from them, and the pieces go to the
lot of their size, named after it ("6 x 5 x 7") and created on their first receipt.

Lots and the stock show the number of pieces on hand of each size, and their weight.
""",
    'depends': ['product_shape', 'stock'],
    'data': [
        'views/stock_lot_views.xml',
        'views/stock_move_views.xml',
        'views/stock_quant_views.xml',
    ],
    'auto_install': True,
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
