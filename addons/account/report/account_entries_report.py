# -*- coding: utf-8 -*-

from openerp import tools
import openerp.addons.decimal_precision as dp
from openerp import models, fields, api
import time

class account_entries_report(models.Model):
    _name = "account.entries.report"
    _description = "Journal Items Analysis"
    _auto = False
    _rec_name = 'date'

    date = fields.Date(string='Effective Date', readonly=True)  # TDE FIXME master: rename into date_effective
    date_maturity = fields.Date(string='Date Maturity', readonly=True)
    ref = fields.Char(string='Reference', readonly=True)
    nbr = fields.Integer(string='# of Items', readonly=True)
    debit = fields.Float(string='Debit', readonly=True)
    credit = fields.Float(string='Credit', readonly=True)
    balance = fields.Float(string='Balance', readonly=True)
    currency_id = fields.Many2one('res.currency', string='Currency', readonly=True)
    amount_currency = fields.Float(string='Amount Currency', digits=0, readonly=True)
    account_id = fields.Many2one('account.account', string='Account', readonly=True, domain=[('deprecated', '=', False)])
    journal_id = fields.Many2one('account.journal', string='Journal', readonly=True)
    product_id = fields.Many2one('product.product', string='Product', readonly=True)
    product_uom_id = fields.Many2one('product.uom', string='Product Unit of Measure', readonly=True)
    move_state = fields.Selection([('draft', 'Unposted'), ('posted', 'Posted')], string='Status', readonly=True)
    reconciled = fields.Boolean('Is reconciled')
    partner_id = fields.Many2one('res.partner', string='Partner', readonly=True)
    analytic_account_id = fields.Many2one('account.analytic.account', string='Analytic Account', readonly=True)
    quantity = fields.Float(string='Products Quantity', digits=(16,2), readonly=True)  # TDE FIXME master: rename into product_quantity
    user_type = fields.Many2one('account.account.type', string='Account Type', readonly=True)
    type = fields.Selection([
        ('receivable', 'Receivable'),
        ('payable', 'Payable'),
        ('cash', 'Cash'),
        ('view', 'View'),
        ('consolidation', 'Consolidation'),
        ('other', 'Regular'),
        ('closed', 'Closed'),
    ], string='Internal Type', readonly=True, help="This type is used to differentiate types with "\
        "special effects in Odoo: view can not have entries, consolidation are accounts that "\
        "can have children accounts for multi-company consolidations, payable/receivable are for "\
        "partners accounts (for debit/credit computations), closed for depreciated accounts.")
    company_id = fields.Many2one('res.company', string='Company', readonly=True)

    _order = 'date desc'

    def init(self, cr):
        tools.drop_view_if_exists(cr, 'account_entries_report')
        cr.execute("""
            create or replace view account_entries_report as (
            select
                l.id as id,
                am.date as date,
                l.date_maturity as date_maturity,
                am.ref as ref,
                am.state as move_state,
                l.reconciled as reconciled,
                l.partner_id as partner_id,
                l.product_id as product_id,
                l.product_uom_id as product_uom_id,
                am.company_id as company_id,
                am.journal_id as journal_id,
                l.account_id as account_id,
                l.analytic_account_id as analytic_account_id,
                at.type as type,
                a.user_type as user_type,
                1 as nbr,
                l.quantity as quantity,
                l.currency_id as currency_id,
                l.amount_currency as amount_currency,
                l.debit as debit,
                l.credit as credit,
                l.debit-l.credit as balance
            from
                account_move_line l
                left join account_account a on (l.account_id = a.id)
                left join account_move am on (am.id=l.move_id)
                left join account_account_type at on (a.user_type = at.id)
            )
        """)
