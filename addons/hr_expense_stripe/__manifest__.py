# Part of Odoo. See LICENSE file for full copyright and licensing details.


{
    'name': 'Expenses Stripe Issuing integration',
    'version': '1.0',
    'category': 'Human Resources/Expenses',
    'sequence': 70,
    'summary': 'Create and manage company credit cards via Stripe',
    'description': """""",
    'website': 'https://www.odoo.com/app/expenses',
    'depends': ['hr_expense'],
    'data': [
        'security/ir.model.access.csv',
        'views/hr_expense_stripe_credit_card.xml',
        'views/hr_employee_views.xml',
        'views/res_config_settings.xml'
    ],
    'post_init_hook': '_post_init_hook_create_stripe_journal',
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
