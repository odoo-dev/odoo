{
    'name': 'ESG HR',
    'version': '1.0',
    'summary': "Employee stats for ESG",
    'depends': [
        'esg',
        'hr',
    ],
    'data': [
        'security/esg_hr_security.xml',
        'security/ir.model.access.csv',
        'report/esg_employee_report_views.xml',
        'views/esg_menus.xml',
    ],
    'auto_install': True,
    'license': 'LGPL-3',
}
