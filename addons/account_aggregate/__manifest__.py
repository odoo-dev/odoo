# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': 'Account Aggregates',
    'version': '1.0',
    'category': '???',
    'description': """
Optimization for large databases.
    """,
    'data': [
        'security/ir.model.access.csv',
    ],
    'depends': [
        'account',
        'base_aggregate',
    ],
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
