# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Payment Provider: 2C2P',
    'version': '1.0',
    'category': 'Accounting/Payment Providers',
    'sequence': 350,
    'summary': "A payment provider for Asia",
    'depends': ['payment'],
    'data': [
        "views/payment_provider_views.xml",
        "views/payment_2c2p_templates.xml",

        "data/payment_provider_data.xml",  # Depends on payment_2c2p_templates.xml
    ],
    'post_init_hook': 'post_init_hook',
    'uninstall_hook': 'uninstall_hook',
    'license': 'LGPL-3',
}
