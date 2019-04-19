{
    'name': 'Argentinian Localization Base',
    'version': '11.0.1.0.0',
    'category': 'Localization',
    'sequence': 14,
    'author': 'ADHOC SA,Odoo Community Association (OCA)',
    'license': 'AGPL-3',
    'summary': '',
    'description': """
Base Module for Argentinian Localization
========================================

* Configure data for used currencies. Principal one ARS and conventions for the most used secondary currencies USD and EUR.
    """,
    'depends': ['base'],
    'data': [
        'data/res_currency_data.xml',
    ],
    'demo': [
    ],
    'installable': True,
    'auto_install': True,
    'application': True,
}
