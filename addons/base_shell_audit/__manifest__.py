{
    'name': 'Shell Audit',
    'description': 'Audit trail for Python commands and SQL queries run in odoo-bin shell.',
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
    'category': 'Technical',
    'depends': ['base'],
    'data': [
        'security/ir.model.access.csv',
        'views/shell_audit_views.xml',
    ],
    'auto_install': False,
}
