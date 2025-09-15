# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    "name": "Marketplace Magento",
    "summary": "Magento 2 Integration for Odoo",
    "category": "Sales/Marketplace",
    "version": "1.0",
    "depends": ["marketplace"],
    "data": [
        "views/marketplace_account_views.xml",
        "data/marketplace_channel_data.xml",
        "data/ir_cron_data.xml",
    ],
    'author': 'Odoo S.A.',
    "license": "LGPL-3",
}
