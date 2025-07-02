# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': "Save Survey",
    'version': '1.0',
    'author': "Odoo PS",
    'category': "Customizations",
    'summary': "Save Survey",
    'website': "https://www.odoo.com/",
    'description': """
        Save Survey
    """,
    'license': "LGPL-3",
    'depends': ['survey', 'portal'],
    'data': [
        'views/survey_templates.xml',
        'security/ir.model.access.csv',
        'views/survey_portal_views.xml',
    ],
    'assets': {
        'survey.survey_assets': [
            'save_survey/static/src/js/survey_form.js',
        ],
    },
    'installable': True,
    'application': True
}
