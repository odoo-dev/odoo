# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': "Marketplace Prestashop",
    'summary': "Prestashop Integration",
    'description': """
Prestashop Integration
    """,
    'category': 'Sales/Marketplace',
    'version': '1.0',
    'depends': ['marketplace'],
    'data': [
        'data/marketplace_channel_data.xml',
        'views/marketplace_account_views.xml'
    ],
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
