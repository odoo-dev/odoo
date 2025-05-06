{
    'name': 'Website Employee',
    'category': 'Website/Website',
    'version': '0.1',
    'summary': 'Show Employees details in your website',
    'description': "This module allows to publish Employee details on your website",
    'depends': ['hr', 'website'],
    'data': [
        'views/snippets/s_employee_details.xml',
        'views/snippets/snippets.xml',
    ],
    'installable': True,
    'auto_install': ['hr', 'website'],
    'assets': {
        'web.assets_frontend': [
            'website_hr_employee/static/src/snippets/**/*',
        ],
        'web.assets_tests': [
            'website_hr_employee/static/tests/**/*',
        ],
    },
    'author': 'Jay Panchal',
    'license': 'LGPL-3',
}
