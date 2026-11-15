{
    'name': "Product Shapes",
    'version': '1.0',
    'category': 'Inventory/Inventory',
    'summary': "Track materials kept by volume or weight in pieces of each size",
    'description': """
Materials bought and sold by volume or by weight, such as timber in cubic feet or
steel in kg, are received and issued as pieces of various sizes.

A product gets a shape (rectangle, sheet, plate, square, pipe, ...), the density of its
material, and the unit its sizes are measured in. When the pieces are received or
issued, the size of a piece and their number give the quantity, and each size is kept
in its own lot: the stock shows the pieces on hand per size, and their weight.
""",
    'depends': ['product'],
    'data': [
        'data/decimal_precision_data.xml',
        'views/product_template_views.xml',
    ],
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
