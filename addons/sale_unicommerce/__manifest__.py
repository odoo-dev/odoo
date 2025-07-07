{
    'name': "sale_unicommerce",

    'summary': "Short (1 phrase/line) summary of the module's purpose",

    'description': """
Long description of module's purpose
    """,

    'author': "My Company",
    # 'website': "https://www.yourcompany.com",

    # Categories can be used to filter modules in modules listing
    # Check https://github.com/odoo/odoo/blob/15.0/odoo/addons/base/data/ir_module_category_data.xml
    # for the full list
    # 'category': 'Uncategorized',
    'version': '0.1',
    'depends': ['sale_management', 'stock_delivery', 'crm'],

    # always loaded
    'data': [
        'security/ir.model.access.csv',
        
        'data/unicommerce_cron.xml',
        'data/unicommerce_channel_data.xml',
        'data/unicommerce_account_data.xml',
        
        'views/marketplace_offer_views.xml',
        'views/unicommerce_account_views.xml',
        # 'views/product_views.xml',
        
        'wizard/res_config_settings_views.xml',
    ],
    # only loaded in demonstration mode
    'demo': [
        'demo/demo.xml',
    ],
}

