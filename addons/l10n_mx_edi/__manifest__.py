# -*- coding: utf-8 -*-
{
    'name': 'EDI for Mexico',
    'version': '0.1',
    'category': 'Hidden',
    'summary': 'Mexican Localization for EDI documents',
    'description': """

    """,
    'depends': ['account', 'base_vat'],
    'data': [
        'security/ir.model.access.csv',
        'data/templates/mx_invoice.xml',
        'data/account_data.xml',
        'views/account_invoice_views.xml',
        'views/res_config_view.xml',
        'views/addenda_views.xml',
        'views/res_partner_view.xml',
    ],
    'demo': [
        'demo/addenda.xml',
    ],
    'installable': True,
    'auto_install': False,
}
