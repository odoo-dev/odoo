{
    'name': 'OmniCommerce',
    'category': 'Sales/Sales',
    'version': '1.0',
    'depends': ['marketplace', 'delivery_integrations', 'website'],
    'data': [
        'security/omni_security.xml',
        'security/ir.model.access.csv',
        'views/res_company_views.xml',
        'views/signup_templates.xml',
        'views/company_menu.xml',
        'views/omnicommerce_menus.xml',
        "data/omnicommerce_data.xml",
    ],
    'assets': {
        'web.assets_frontend': [
            '/omnicommerce/static/src/scss/signup.scss',
            '/omnicommerce/static/src/pages/signup_page.xml',
            '/omnicommerce/static/src/pages/signup_page.js',
        ],
    },
    'post_init_hook': 'post_init_hook',
    # 'uninstall_hook': 'uninstall_hook',
    'author': 'Odoo S.A.',
    'license': "OEEL-1",
}
