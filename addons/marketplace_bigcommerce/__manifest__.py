# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': "Marketplace Bigcommerce",
    'summary': "Bigcommerce Integration",
    'description': """
Bigcommerce Integration
    """,
    'category': 'Sales/Marketplace',
    'version': '1.0',
    'depends': ['marketplace'],
    'data': [
        'views/marketplace_account_views.xml',
        'data/marketplace_channel_data.xml',
    ],
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
