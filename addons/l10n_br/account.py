# -*- encoding: utf-8 -*-

import openerp
from openerp.osv import fields, osv

TAX_DEFAULTS = {
                'base_reduction': 0,
                'amount_mva': 0,
                }

def get_precision_tax():
    def change_digit_tax(cr):
        decimal_precision = openerp.registry(cr.dbname)['decimal.precision']
        res = decimal_precision.precision_get(cr, 1, 'Account')
        return (16, res+2)
    return change_digit_tax

class account_tax_template(osv.osv):
    """ Add fields used to define some brazilian taxes """
    _inherit = 'account.tax.template'
    
    _columns = {
               'tax_discount': fields.boolean('Discount this Tax in Prince', 
                                              help="Mark it for (ICMS, PIS e etc.)."),
               'base_reduction': fields.float('Redution', required=True, 
                                              digits_compute=get_precision_tax(), 
                                              help="Um percentual decimal em % entre 0-1."),
               'amount_mva': fields.float('MVA Percent', required=True, 
                                          digits_compute=get_precision_tax(), 
                                          help="Um percentual decimal em % entre 0-1."),
               'type': fields.selection([('percent','Percentage'), 
                                         ('fixed','Fixed Amount'), 
                                         ('none','None'), 
                                         ('code','Python Code'), 
                                         ('balance','Balance'), 
                                         ('quantity','Quantity')], 'Tax Type', required=True,
                                        help="The computation method for the tax amount."),
               }
    _defaults = TAX_DEFAULTS

class account_tax(osv.osv):
    """ Add fields used to define some brazilian taxes """
    _inherit = 'account.tax'

    _columns = {
               'tax_discount': fields.boolean('Discount this Tax in Prince', 
                                              help="Mark it for (ICMS, PIS e etc.)."),
               'base_reduction': fields.float('Redution', required=True, 
                                              digits_compute=get_precision_tax(), 
                                              help="Um percentual decimal em % entre 0-1."),
               'amount_mva': fields.float('MVA Percent', required=True, 
                                          digits_compute=get_precision_tax(), 
                                          help="Um percentual decimal em % entre 0-1."),
               'type': fields.selection([('percent','Percentage'), 
                                         ('fixed','Fixed Amount'), 
                                         ('none','None'), 
                                         ('code','Python Code'), 
                                         ('balance','Balance'), 
                                         ('quantity','Quantity')], 'Tax Type', required=True,
                                        help="The computation method for the tax amount."),
               }
    _defaults = TAX_DEFAULTS
