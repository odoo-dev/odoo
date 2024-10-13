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
        'security/ir.model.access.csv',
        'views/graph_views.xml',
    ],
    'demo': [
        'demo/graph_demo.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'graphview/static/src/js/graph_widget.js',
            'graphview/static/src/xml/graph_widget.xml',
        ],
    },
    'installable': True,
}
