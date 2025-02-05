# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'ESG',
    'version': '1.0',
    'summary': "Calculate and report a company's Environmental, Social, and Governance (ESG) impact.",
    'depends': [
        'account',
    ],
    'data': [
        'data/esg_data.xml',
        'security/ir.model.access.csv',
        'report/esg_emitted_emission_report_views.xml',
        'wizard/factors_retroaction_wizard_views.xml',
        'views/account_move_views.xml',
        'views/esg_emission_factor_views.xml',
        'views/esg_emission_source_views.xml',
        'views/esg_gas_views.xml',
        'views/esg_other_emission_views.xml',
        'views/esg_menus.xml',
    ],
    'demo': [
        'data/demo_data.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'esg/static/src/*',
            'esg/static/src/img/*',
            'esg/static/src/scss/esg.scss',
            # 'esg/static/src/**/*',
        ],
        'web.assets_web_dark': [
            'esg/static/src/scss/*.dark.scss',
        ],
    },
    'application': True,
    'license': 'LGPL-3',
}
