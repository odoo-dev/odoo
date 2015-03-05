# -*- encoding: utf-8 -*-
{
    'name': 'Account Bank Statement Import',
    'category': 'Accounting & Finance',
    'version': '1.0',
    'author': 'Odoo SA',
    'depends': ['account'],
    'description': """Generic Wizard to Import Bank Statements. Includes the import of files in .OFX format""",
    'data': [
        'account_bank_statement_import_view.xml',
        'account_import_tip_data.xml'
    ],
    'demo': [
        'demo/partner_bank.xml',
    ],
    'installable': True,
    'auto_install': True,
}
