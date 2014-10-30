# -*- coding: utf-8 -*-


import logging

from openerp.osv import fields, osv

_logger = logging.getLogger(__name__)

class argentinian_base_configuration(osv.osv_memory):
    _name = 'argentinian.base.config.settings'
    _inherit = 'res.config.settings'

    _columns = {
        'module_l10n_ar_chart_generic': fields.boolean('Generic Argentinian Chart of Account',
            help = """Installs the l10n_ar_chart_generic module."""),
        'module_l10n_ar_bank': fields.boolean('Banks of Argentina',
            help = """Installs the l10n_ar_bank module that create banks of Argetina based on a webservice"""),
        'module_l10n_ar_base_vat': fields.boolean('Argentinian VAT validation',
            help = """Installs the l10n_ar_base_vat module that extends base_vat modules so that you can add argentinian VATs (usually called cuit/cuil)"""),
        'module_l10n_ar_invoice': fields.boolean('Argentinian invoicing and other documents Management',
            help = """Installs the l10n_ar_invoice module. It creates some clases to manage afip functionality, for example document class, journal class, document letters, vat categories, etc."""),          
        'module_l10n_ar_partner_title': fields.boolean('Partner reference and titles usually used in Argentina',
            help = """Installs the l10n_ar_partner_title module. """),
        'module_l10n_ar_states': fields.boolean('Argentinian States',
            help = """Installs the l10n_ar_states module. """), 
        'module_l10n_ar_vat_reports': fields.boolean('Argentinian Sale/Purchase Vat Reports',
            help = """Installs the l10n_ar_vat_reports module. """),                                                      
        'module_l10n_ar_hide_receipts': fields.boolean('Hide sale/purchase receipts menus.',
            help = """Installs the l10n_ar_hide_receipts module. """),        
        'module_account_accountant': fields.boolean('Manage Financial and Analytic Accounting.',
            help = """Installs the account_accountant module. """),         
        'module_l10n_ar_wsafip_fe': fields.boolean('Use Electronic Invoicing.',
            help = """Installs the l10n_ar_wsafip_fe module. """),              
        'module_l10n_ar_account_vat_ledger': fields.boolean('Add Account VAT Ledger models and report.',
            help = """Installs the l10n_ar_account_vat_ledger module. """),                         
        # 'default_coding_method':fields.selection([('category','Based on the Category'), ('group','Based on Major / Sub Groups')], required=True, default_model='product.product'),     
        # Sales
        'module_l10n_ar_invoice_sale': fields.boolean('Add availabilty to use VAT included or not on sales',
            help = """Installs the l10n_ar_invoice_sale module."""),
        # Aeroo reports
        'module_l10n_ar_aeroo_invoice': fields.boolean('Argentinian Aeroo Like Invoice Report',
            help = """Installs the module_l10n_ar_aeroo_invoice module."""),
        'module_l10n_ar_aeroo_einvoice': fields.boolean('Argentinian Aeroo Like Electronic Invoice Report',
            help = """Installs the module_l10n_ar_aeroo_einvoice module."""),
        'module_l10n_ar_aeroo_stock': fields.boolean('Argentinian Aeroo Like Remit Report',
            help = """Installs the l10n_ar_aeroo_stock module."""),
        'module_l10n_ar_aeroo_purchase': fields.boolean('Argentinian Aeroo Like Purchase Reports',
            help = """Installs the l10n_ar_aeroo_purchase module."""),
        'module_l10n_ar_aeroo_sale': fields.boolean('Argentinian Aeroo Like Sale Reports',
            help = """Installs the l10n_ar_aeroo_sale module."""),
        'module_l10n_ar_aeroo_receipt': fields.boolean('Argentinian Aeroo Like Receipt Report',
            help = """Installs the l10n_ar_aeroo_receipt module."""),        
    }        
    
    _defaults = {
    }

# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:
