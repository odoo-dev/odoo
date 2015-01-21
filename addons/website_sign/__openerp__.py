# -*- coding: utf-8 -*-

{
    'name': 'Digital Signatures',
    'version': '1.0',
    'category': 'Website',
    'description': """
Sign your documents easily by sending invitations to your recipients.\n
Next to your attached files, you have the possibility to request a signature.\n
Select your recipients and follow the signature process easily.
    """,
    'author': 'OpenERP SA',
    'website': 'http://www.openerp.com',
    'depends': ['website'],
    'data': [
        'security/ir.model.access.csv',
        'views/website_sign.xml',
        'views/items_view.xml',
        'data/website_sign_data.xml',
        'data/workflows.xml',
    ],
    'demo': [],
    'qweb': [
        'static/src/xml/*.xml'
    ],
    'installable': True,
}
# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4: