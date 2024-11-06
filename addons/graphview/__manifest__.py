{
    'name': 'Graph View',
    'version': '1.0',
    'category': 'Extra Tools',
    'summary': 'Custom graph view using Cytoscape.js',
    'description': """
This module provides a custom graph view using Cytoscape.js.
    """,
    'depends': ['base'],
    'data': [
        'data/graphview_data.xml',
        'security/ir.model.access.csv',
        'views/graphview_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'graphview/static/src/js/graphview_widget.js',
            'graphview/static/src/xml/graphview_widget.xml',
        ],
    },
    'author': 'cwg',
    'installable': True,
    'license': 'LGPL-3',
}
