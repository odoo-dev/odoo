
from odoo import fields, models

from odoo.addons.account.models.product_template import ACCOUNT_DOMAIN


class ProductCategory(models.Model):
    _inherit = "product.category"

    property_account_income_categ_id = fields.Many2one('account.account', company_dependent=True,
        string="Income Account",
        domain=ACCOUNT_DOMAIN,
        help="This account will be used when validating a customer invoice.",
        tracking=True,
        ondelete='restrict',
    )
    property_account_expense_categ_id = fields.Many2one('account.account', company_dependent=True,
        string="Expense Account",
        domain=ACCOUNT_DOMAIN,
        help="The expense is accounted for when a vendor bill is validated, except in anglo-saxon accounting with perpetual inventory valuation in which case the expense (Cost of Goods Sold account) is recognized at the customer invoice validation.",
        tracking=True,
        ondelete='restrict',
    )
    property_valuation = fields.Selection(
        string="Inventory Valuation",
        selection=[
            ('periodic', 'Periodic (at closing)'),
            ('real_time', 'Perpetual (at invoicing)'),
        ],
        company_dependent=True, copy=True, tracking=True,
        help="""Periodic: The accounting entries are suggested manually in the inventory valuation report.
        Perpetual: An accounting entry is automatically created to value the inventory when a product is billed or invoiced.
        """)
    property_stock_valuation_account_id = fields.Many2one(
        'account.account', 'Stock Valuation Account', company_dependent=True, ondelete='restrict',
        check_company=True,
        help="""When automated inventory valuation is enabled on a product, this account will hold the current value of the products.""")
    property_stock_valuation_account_active = fields.Boolean(related='property_stock_valuation_account_id.active', string="Stock Valuation Account Active")
    property_stock_journal = fields.Many2one(
        'account.journal', 'Stock Journal', company_dependent=True,
        help="When doing automated inventory valuation, this is the Accounting Journal in which entries will be automatically posted when stock moves are processed.")
    account_stock_variation_id = fields.Many2one(
        'account.account', string="Stock Variation Account", readonly=False,
        related="property_stock_valuation_account_id.account_stock_variation_id")
    account_stock_variation_active = fields.Boolean(related='account_stock_variation_id.active', string="Stock Variation Account Active")
    property_cost_method = fields.Selection(
        string="Costing Method",
        selection=[
            ('standard', "Standard Price"),
            ('average', "Average Cost (AVCO)"),
        ],
        company_dependent=True, copy=True,
        default=lambda self: self.env.company.cost_method,
        help="""Standard Price: The products are valued at their standard cost defined on the product.
        Average Cost (AVCO): The products are valued at weighted average cost.
        """,
        tracking=True,
    )
    property_price_difference_account_id = fields.Many2one(
        'account.account', 'Price Difference Account', company_dependent=True, ondelete='restrict',
        check_company=True,
        help="""With perpetual valuation, this account will hold the price difference between the standard price and the bill price.""")
    property_price_difference_account_active = fields.Boolean(related='property_price_difference_account_id.active', string="Price Difference Account Active")
