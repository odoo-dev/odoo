{
    'name': "web_client",
    'summary': "A low level javascript framework for building Odoo application",
    'description': """
Long description of module's purpose
    """,
    'author': "Odoo S.A.",
    'depends': ['web_core'],
    'category': 'Framework',
    'version': '0.1',
    'application': True,
    'installable': True,
    'data': [
        'views/templates.xml',
    ],
    'assets': {
        'web_client.assets': [
            ('include', 'web._assets_helpers'),
            ('include', 'web._assets_backend_helpers'),
            'web/static/src/scss/pre_variables.scss',
            'web/static/lib/bootstrap/scss/_variables.scss',
            'web/static/lib/bootstrap/scss/_variables-dark.scss',
            'web/static/lib/bootstrap/scss/_maps.scss',
            ('include', 'web._assets_bootstrap_backend'),
            ('include', 'web_core.assets'),
            'web_client/static/src/**/*',
        ],
    },
}
