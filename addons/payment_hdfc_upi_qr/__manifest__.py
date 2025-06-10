# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': "Payment Provider: HDFC UPI QR",
    'version': '1.0',
    'category': 'Accounting/Payment Providers',
    'sequence': 350,
    'summary': "A payment provider enabling payments via HDFC UPI QR codes.",
    'description': " ",  # Non-empty string to avoid loading the README file.
    'depends': [
        'payment',
        'l10n_in',
    ],
    'data': [
        'views/payment_hdfc_upi_templates.xml',
        'views/payment_provider_views.xml',
        'views/payment_transaction_views.xml',
        
        'data/payment_provider_data.xml',  # Depends on views/payment_hdfc_upi_templates.xml
    ],
    'post_init_hook': 'post_init_hook',
    'uninstall_hook': 'uninstall_hook',
    'assets': {
        'web.assets_frontend': [
            'payment_hdfc_upi_qr/static/src/js/payment_form.js',
            'payment_hdfc_upi_qr/static/src/scss/payment_form.scss',
        ],
    },
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
