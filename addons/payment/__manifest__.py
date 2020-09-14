# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Payment Acquirer',
    'version': '2.0',
    'category': 'Hidden',
    'summary': 'Base Module for Payment Acquirers',
    'description': """Payment Acquirer Base Module""",
    'depends': ['account'],
    'data': [
        'data/account_data.xml',
        'data/payment_icon_data.xml',
        'data/payment_acquirer_data.xml',
        'data/payment_cron.xml',
        'views/payment_views.xml',
        'views/account_payment_views.xml',
        'views/account_invoice_views.xml',
        'views/payment_acquirer_onboarding_templates.xml',
        'views/payment_templates.xml',
        'views/payment_portal_templates.xml',
        'views/assets.xml',
        'views/res_partner_views.xml',
        'security/ir.model.access.csv',
        'security/payment_security.xml',
        'wizards/payment_link_wizard_views.xml',
        'wizards/account_payment_register_views.xml',
    ],
    'auto_install': True,
}
