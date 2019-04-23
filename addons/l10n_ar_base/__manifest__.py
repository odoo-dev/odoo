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
* Add type of identifications in Argentina defined by AFIP
* Agregado de Títulos de personería comunmente utilizados en argentina (SA, SRL, Doctor, etc)


    """,
    'depends': [
        'base',

        'portal',
        'partner_identification',
        # this is for demo data, for fiscal position data on account
        # and also beacuse it is essential for argentinian use
        # for the sales config
        'base_setup',
    ],
    'data': [
        'data/res_currency_data.xml',
        'data/res_bank_data.xml',
        'data/res_partner_id_category_data.xml',
        'data/res_partner_title_data.xml',
        'views/res_partner_bank_views.xml',

        'views/res_partner_view.xml',
        'views/res_company_view.xml',
        'views/res_partner_id_category_view.xml',
        'views/portal_templates.xml',
        'security/security.xml',

        'security/ir.model.access.csv',
    ],
    'demo': [
        'demo/partner_demo.xml',
    ],
    'installable': True,
    'auto_install': True,
    'application': True,
}
