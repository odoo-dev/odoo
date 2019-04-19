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
* Adds Argentinian Banks data enable by BCRA (Central Bank of Argentina)
* Add new field named CBU to bank model.
    """,
    'depends': ['base'],
    'data': [
        'data/res_currency_data.xml',
        'data/res_bank_data.xml',
        'views/res_partner_bank_views.xml',
    ],
    'demo': [
    ],
    'installable': True,
    'auto_install': True,
    'application': True,
}
