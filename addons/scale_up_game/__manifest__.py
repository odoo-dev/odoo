{
    'name': 'Scale-Up! Virtual Business Game',
    'version': '19.0.1.0.0',
    'category': 'Inventory/Inventory',
    'summary': 'Interactive 3D business simulation driven by real Odoo inventory (Level 1: Restock the Shelf)',
    'description': """
Scale-Up! is a 3D virtual business game rendered with Three.js inside the Odoo
web client. Odoo is the source of truth: every game action runs real Odoo
business logic (Level 1 performs a genuine internal stock transfer).
""",
    'depends': ['base', 'web', 'stock'],
    'data': [
        'security/game_security.xml',
        'security/ir.model.access.csv',
        'data/game_level_data.xml',
        'views/game_menu.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'scale_up_game/static/src/**/*',
        ],
    },
    'post_init_hook': 'post_init_hook',
    'application': True,
    'installable': True,
    'license': 'LGPL-3',
}
