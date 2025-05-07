# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': "NeoLeap Payment Gateway",
    'version': '1.0',
    'category': 'Accounting/Payment Providers',
    'summary': "Integration with NeoLeap (Al Rajhi Bank)",
    'description': " ",  # Non-empty string to avoid loading the README file.
    'depends': ['payment'],
    'data': [
        'views/payment_neoleap_templates.xml',
        'data/payment_provider_data.xml',
        'views/payment_provider_form.xml',
    ],
    'post_init_hook': 'post_init_hook',
    'uninstall_hook': 'uninstall_hook',
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
