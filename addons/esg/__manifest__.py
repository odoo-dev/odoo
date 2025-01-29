# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'ESG',
    'version': '1.0',
    'summary': "Calculate and report a company's Environmental, Social, and Governance (ESG) impact.",
    'depends': [
        'base_setup',
        'mail',
    ],
    'data': [
        'security/ir.model.access.csv',
        'data/esg_data.xml',
        'views/emission_source_views.xml',
        'views/esg_gas_views.xml',
        'views/esg_menus.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'esg/static/src/**/*',
        ],
    },
    'application': True,
    'license': 'LGPL-3',
}
