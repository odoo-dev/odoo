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
    'depends': ['website', 'knowledge'], # TODO : knowledge is not properly installed...
    'data': [
        'security/ir.model.access.csv',

        'views/signature_request_templates.xml',
        'views/signature_item_templates.xml',

        'views/signature_request_view.xml',
        'views/signature_item_view.xml',

        'data/signature_request.xml',
    ],
    'demo': [],
    'qweb': [
        'static/src/xml/*.xml'
    ],
    'installable': True,
}
