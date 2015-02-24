# -*- coding: utf-8 -*-

from openerp import api, fields, models, _
from openerp.exceptions import UserError


class product_category(models.Model):
    _inherit = "product.category"

    property_account_income_categ = fields.Many2one('account.account', company_dependent=True,
        string="Income Account",
        domain=[('deprecated', '=', False)],
        help="This account will be used for invoices to value sales.")
    property_account_expense_categ = fields.Many2one('account.account', company_dependent=True,
        string="Expense Account",
        domain=[('deprecated', '=', False)],
        help="This account will be used for invoices to value expenses.")

#----------------------------------------------------------
# Products
#----------------------------------------------------------
class product_template(models.Model):
    _inherit = "product.template"

    taxes_id = fields.Many2many('account.tax', 'product_taxes_rel', 'prod_id', 'tax_id', string='Customer Taxes',
        domain=[('type_tax_use', '=', 'sale')])
    supplier_taxes_id = fields.Many2many('account.tax', 'product_supplier_taxes_rel', 'prod_id', 'tax_id', string='Supplier Taxes',
        domain=[('type_tax_use', '=', 'purchase')])
    property_account_income = fields.Many2one('account.account', company_dependent=True,
        string="Income Account",
        domain=[('deprecated', '=', False)],
        help="This account will be used for invoices instead of the default one to value sales for the current product.")
    property_account_expense = fields.Many2one('account.account', company_dependent=True,
        string="Expense Account",
        domain=[('deprecated', '=', False)],
        help="This account will be used for invoices instead of the default one to value expenses for the current product.")

    @api.multi
    def write(self, vals):
        if 'uom_po_id' in vals:
            products = self.env['product.product'].search([('product_tmpl_id', 'in', self.ids)])
            if self.env['account.move.line'].search([('product_id', 'in', products.ids)], limit=1):
                raise UserError(_('You can not change the unit of measure of a product that has been already used in an account journal item. If you need to change the unit of measure, you may deactivate this product.'))
        return super(product_template, self).write(vals)

    @api.multi
    def _get_product_accounts(self):
        return {
            'income': self.property_account_income or self.categ_id.property_account_income_categ,
            'expense': self.property_account_expense or self.categ_id.property_account_expense_categ
        }

    @api.multi
    def get_product_accounts(self, fiscal_pos=None):
        accounts = self._get_product_accounts()
        if not fiscal_pos:
            fiscal_pos = self.env['account.fiscal.position']
        return fiscal_pos.map_accounts(accounts)
