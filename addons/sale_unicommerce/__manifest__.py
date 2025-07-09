# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': "Unicommerce Connector for Odoo",
    'summary': "Sync Orders, Products, and Inventory between Unicommerce and Odoo",
    'description': """
Integrate Unicommerce OMS with Odoo.
This module enables automatic sync of Sales Orders, Product Catalog, and Inventory data.
    """,

    'author': "Odoo",
    'website': "https://www.odoo.com",
    'category': 'Sales',
    'version': '1.0',

    'depends': [
        'sale_management',
        'stock_delivery',
        'crm',
    ],
    'data': [
        'security/ir.model.access.csv',

        'data/unicommerce_cron.xml',
        'data/unicommerce_channel_data.xml',

        'views/marketplace_offer_views.xml',
        'views/unicommerce_account_views.xml',
        # 'views/product_views.xml',

        'wizard/res_config_settings_views.xml',
    ],
    'installable': True,
    'license': 'LGPL-3',
}
