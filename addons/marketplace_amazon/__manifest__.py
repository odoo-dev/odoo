# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': "Marketplace Amazon",
    'summary': "Amazon Integration",
    'description': """
Amazon Integration
    """,
    'category': 'Sales/Marketplace',
    'version': '1.0',
    'depends': ['marketplace'],
    'data': [
        'data/marketplace_channel_data.xml',
        'views/amazon_marketplace_views.xml',
        'security/ir.model.access.csv',
        'data/amazon_data.xml',
        'views/marketplace_account_views.xml',
        'views/marketplace_amazon_templates.xml',
    ],
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
