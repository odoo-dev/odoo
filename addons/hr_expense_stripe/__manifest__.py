# Part of Odoo. See LICENSE file for full copyright and licensing details.

# Stripe compatible API version is '2025-01-27.acacia'
{
    'name': 'Expenses Stripe Issuing integration',
    'version': '1.0',
    'category': 'Human Resources/Expenses',
    'sequence': 70,
    'summary': 'Create and manage company credit cards via Stripe',
    'author': 'Odoo S.A.',
    'description': """Stripe Issuing integration for expenses""",
    'website': 'https://www.odoo.com/app/expenses',
    'depends': ['hr_expense'],
    'data': [
        'security/ir.model.access.csv',

        'data/product.mcc.stripe.tag.csv',
        'data/product_product_data.xml',

        'views/hr_expense_stripe_credit_card.xml',
        'views/hr_expense_views.xml',
        'views/res_config_settings.xml',

        'wizard/cardholder_wizard.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'hr_expense_stripe/static/src/**/*',
        ],
    },
    'post_init_hook': '_post_init_hook_create_stripe_journal',
    'installable': True,
    'license': 'LGPL-3',
    # TODO add uninstall system to delete account
}
