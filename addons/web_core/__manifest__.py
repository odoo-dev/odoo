{
    'name': "web_core",
    'summary': "A low level javascript framework for building Odoo application",
    'description': """
Long description of module's purpose
    """,

    'author': "Odoo S.A.",

    # Categories can be used to filter modules in modules listing
    # Check https://github.com/odoo/odoo/blob/15.0/odoo/addons/base/data/ir_module_category_data.xml
    # for the full list
    'category': 'Framework',
    'version': '0.1',
    'depends': ['base'],
    'assets': {
        'web_core.assets': [
            'web_core/static/src/module_loader.js',
            'web_core/static/lib/owl/owl.js',
            'web_core/static/lib/owl/odoo_module.js',
            'web_core/static/src/**/*',
        ],
    },
}
