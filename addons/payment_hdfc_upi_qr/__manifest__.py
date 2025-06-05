{
    'name': "Payment Provider: HDFC UPI QR",
    'version': '1.0',
    'category': 'Accounting/Payment Providers',
    'sequence': 350,
    'summary': 'A payment provider module enabling payments via dynamic QR codes.',
'description': " ",  # Non-empty string to avoid loading the README file.    
    'depends': [
        'payment',
        'l10n_in',
    ],
    'data': [
        'views/payment_hdfc_upi_templates.xml',
        'views/payment_provider_views.xml',
        'views/payment_transaction_views.xml',
        'data/payment_provider_data.xml',
    ],
    'post_init_hook': 'post_init_hook',
    'uninstall_hook': 'uninstall_hook',
    'license': 'LGPL-3',
    'assets': {
        'web.assets_frontend': [
            'payment_hdfc_upi_qr/static/src/js/payment_form.js',
            'payment_hdfc_upi_qr/static/src/css/payment_form.css',
        ],
    },
}
