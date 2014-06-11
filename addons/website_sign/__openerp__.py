# -*- coding: utf-8 -*-

{
    'name': 'Digital Sign on Document',
    'version': '1.0',
    'category': 'Website',
    'description': """
Digital sign on attached Document.
===================================

    """,
    'author': 'OpenERP SA',
    'website': 'http://www.openerp.com',
    'depends': ['website'],
    'data': [
        'security/ir.model.access.csv',
        'views/website_sign.xml',
        'data/website_sign_data.xml',
    ],
    'demo': [],
    'qweb': [
        'static/src/xml/*.xml'
    ],
    'installable': True,
}
# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4: