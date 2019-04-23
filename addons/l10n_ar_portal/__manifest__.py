{
    'name': 'Argentinian Localization Base',
    'version': '11.0.1.0.0',
    'category': 'Localization',
    'sequence': 14,
    'author': 'ADHOC SA,Odoo Community Association (OCA)',
    'license': 'AGPL-3',
    'summary': '',
    'description': """
Argentinian Localization Portal
===============================

* Add the ability to set in portal:

* id number
* id category
* afip responsability
    """,
    'depends': [
        'l10n_ar_account',
        'portal',
    ],
    'data': [
        'views/portal_templates.xml',
    ],
    'demo': [
        'demo/partner_demo.xml',
    ],
    'installable': True,
    'auto_install': False,
    'application': True,
}
