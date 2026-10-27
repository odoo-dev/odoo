# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': 'Existing Bill for expenses',
    'version': '1.0',
    'description': """
This is a bridge module to link an existing bill to an expense, it'll be removed later and merged into hr_expense
    """,
    'depends': ['hr_expense'],
    'auto_install': True,
    'data': [
        'views/account_move_views.xml',
        'views/hr_expense_views.xml',
    ],
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
