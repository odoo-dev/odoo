
from odoo import Command, _, api, fields, models
from odoo.exceptions import UserError, ValidationError
from odoo.fields import Domain
from odoo.tools import format_amount
from odoo.tools.constants import IN_MAX
from odoo.tools.misc import split_every

ACCOUNT_DOMAIN = [('account_type', 'not in', ('asset_receivable', 'liability_payable', 'asset_cash', 'liability_credit_card', 'off_balance'))]


class ProductTemplate(models.Model):
    _inherit = "product.template"

    taxes_id = fields.Many2many('account.tax', 'product_taxes_rel', 'prod_id', 'tax_id',
        string="Sales Taxes",
        help="Default taxes used when selling the product",
        domain=[('type_tax_use', '=', 'sale')],
        default=lambda self: self.env.companies.account_sale_tax_id or self.env.companies.root_id.sudo().account_sale_tax_id,
    )
    tax_string = fields.Char(compute='_compute_tax_string')
    supplier_taxes_id = fields.Many2many('account.tax', 'product_supplier_taxes_rel', 'prod_id', 'tax_id',
        string="Purchase Taxes",
        help="Default taxes used when buying the product",
        domain=[('type_tax_use', '=', 'purchase')],
        default=lambda self: self.env.companies.account_purchase_tax_id or self.env.companies.root_id.sudo().account_purchase_tax_id,
    )
    property_account_income_id = fields.Many2one('account.account', company_dependent=True, ondelete='restrict',
        string="Income Account",
        domain=ACCOUNT_DOMAIN,
        help="Keep this field empty to use the default value from the product category.")
    property_account_income_active = fields.Boolean(related='property_account_income_id.active', string="Income Account Active")
    property_account_expense_id = fields.Many2one('account.account', company_dependent=True, ondelete='restrict',
        string="Expense Account",
        domain=ACCOUNT_DOMAIN,
        help="Keep this field empty to use the default value from the product category. If anglo-saxon accounting with automated valuation method is configured, the expense account on the product category will be used.")
    property_account_expense_active = fields.Boolean(related='property_account_expense_id.active', string="Expense Account Active")
    account_tag_ids = fields.Many2many(
        string="Account Tags",
        comodel_name='account.account.tag',
        ui_domain="[('applicability', '=', 'products')]",
        help="Tags to be set on the base and tax journal items created for this product.")
    fiscal_country_codes = fields.Char(compute='_compute_fiscal_country_codes')
    valuation = fields.Selection(
        string="Valuation",
        selection=[
            ('periodic', 'Periodic (at closing)'),
            ('real_time', 'Perpetual (at invoicing)'),
        ],
        compute='_compute_valuation', search='_search_valuation',
    )
    cost_method = fields.Selection(
        string="Cost Method",
        selection=[
            ('standard', "Standard Price"),
            ('average', "Average Cost (AVCO)"),
        ],
        compute='_compute_cost_method',
    )

    def _get_product_accounts(self):
        # Cached for the transaction: this is called once per product for every product involved
        # in a valuation report/closing, and doesn't account for account/category changes made
        # within the same transaction.
        cache = self.env.cr.cache.setdefault('account_product_accounts', {})
        key = (self.id, self.env.company.id)
        if key in cache:
            # Copy: some overrides mutate the returned dict in place (e.g. `mrp_account`, `l10n_de`).
            return dict(cache[key])

        stock_valuation = self._get_category_account('property_stock_valuation_account_id', 'account_stock_valuation_id')
        cache[key] = {
            'income': (
                self.property_account_income_id
                or self._get_category_account('property_account_income_categ_id', 'income_account_id')
            ),
            'expense': (
                self.property_account_expense_id
                or self._get_category_account('property_account_expense_categ_id', 'expense_account_id')
            ),
            'stock_valuation': stock_valuation,
            'stock_variation': stock_valuation.account_stock_variation_id,
        }
        return dict(cache[key])

    def _get_category_account(self, field_name, company_field=None):
        """
        Return the first account defined on the product category hierarchy
        for the given field, falling back on the company's `company_field`
        account when none is found on the hierarchy.
        """
        categ = self.categ_id
        while categ:
            account = categ[field_name]
            if account:
                return account
            categ = categ.parent_id
        if company_field:
            return (self.company_id or self.env.company).sudo()[company_field].with_env(self.env)
        return self.env['account.account']

    def get_product_accounts(self, fiscal_pos=None):
        accounts = {
            key: (fiscal_pos or self.env['account.fiscal.position']).map_account(account)
            for key, account in self._get_product_accounts().items()
        }
        # `stock_journal` is an `account.journal`, not an `account.account`: it doesn't go
        # through the fiscal-position account mapping above.
        accounts['stock_journal'] = self.categ_id.property_stock_journal or self.env.company.account_stock_journal_id
        return accounts

    @api.depends('company_id')
    @api.depends_context('allowed_company_ids')
    def _compute_fiscal_country_codes(self):
        for record in self:
            allowed_companies = record.company_id or self.env.companies
            record.fiscal_country_codes = ",".join(allowed_companies.mapped('account_fiscal_country_id.code'))

    def _search_valuation(self, operator, value):
        if operator != '=':
            raise UserError(self.env._("You can only use the '=' operator to search on valuation field."))
        if value not in ['periodic', 'real_time']:
            raise UserError(self.env._("Only the value 'periodic' and 'real_time' are accepted to search on valuation field."))
        domain_categ = Domain([('categ_id.property_valuation', operator, value)])
        domain_company = Domain(['|', ('categ_id.property_valuation', '=', False), ('categ_id', '=', False), ('company_id.inventory_valuation', operator, value)])

        if self.env.company.inventory_valuation and self.env.company.inventory_valuation == value:
            domain_company = Domain(['|', ('categ_id.property_valuation', '=', False), ('categ_id', '=', False), '|', ('company_id.inventory_valuation', operator, value), ('company_id', '=', False)])
        return Domain(self.env.company._get_inventory_valuation_products_domain()) & (domain_company | domain_categ)

    @api.depends_context('company')
    @api.depends('is_storable', 'categ_id.property_valuation')
    def _compute_valuation(self):
        for product_template in self:
            if not product_template.is_storable:
                product_template.valuation = False
                continue
            company = product_template.company_id
            if not company or self.env.company.filtered_domain([('id', 'child_of', company.id)]):
                company = self.env.company
            product_template.valuation = product_template.categ_id.with_company(company).property_valuation or company.inventory_valuation

    @api.depends_context('company')
    @api.depends('categ_id.property_cost_method')
    def _compute_cost_method(self):
        for product_template in self:
            company = product_template.company_id
            if not company or self.env.company.filtered_domain([('id', 'child_of', company.id)]):
                company = self.env.company
            product_template.cost_method = (
                product_template.categ_id.with_company(company).sudo().property_cost_method
                or company.sudo().cost_method
            )

    @api.depends('taxes_id', 'list_price')
    @api.depends_context('company')
    def _compute_tax_string(self):
        for record in self:
            record.tax_string = record._construct_tax_string(record.list_price)

    def _construct_tax_string(self, price):
        currency = self.currency_id
        res = self.taxes_id._filter_taxes_by_company(self.env.company).compute_all(
            price, product=self, partner=self.env['res.partner']
        )
        joined = []
        included = res['total_included']
        if currency.compare_amounts(included, price):
            joined.append(_('%(amount)s Incl. Taxes', amount=format_amount(self.env, included, currency)))
        excluded = res['total_excluded']
        if currency.compare_amounts(excluded, price):
            joined.append(_('%(amount)s Excl. Taxes', amount=format_amount(self.env, excluded, currency)))
        if joined:
            tax_string = f"(= {', '.join(joined)})"
        else:
            tax_string = " "
        return tax_string

    @api.constrains('uom_id')
    def _check_uom_not_in_invoice(self):
        self.env['product.template'].flush_model(['uom_id'])
        self.env.cr.execute("""
            SELECT prod_template.id
              FROM account_move_line line
              JOIN product_product prod_variant ON line.product_id = prod_variant.id
              JOIN product_template prod_template ON prod_variant.product_tmpl_id = prod_template.id
              JOIN uom_uom template_uom ON prod_template.uom_id = template_uom.id
              JOIN uom_uom line_uom ON line.product_uom_id = line_uom.id
             WHERE prod_template.id IN %s
               AND line.parent_state = 'posted'
               AND template_uom.id != line_uom.id
             LIMIT 1
        """, [tuple(self.ids)])
        if self.env.cr.fetchall():
            raise ValidationError(_(
                "This product is already being used in posted Journal Entries.\n"
                "If you want to change its Unit of Measure, please archive this product and create a new one."
            ))

    @api.onchange('type')
    def _onchange_type(self):
        if self.type == 'combo':
            self.taxes_id = False
            self.supplier_taxes_id = False
        return super()._onchange_type()

    def _force_default_sale_tax(self, companies):
        default_customer_taxes = companies.filtered('account_sale_tax_id').account_sale_tax_id
        if not default_customer_taxes:
            return
        links = [Command.link(t.id) for t in default_customer_taxes]
        for sub_ids in split_every(IN_MAX, self.ids):
            chunk = self.browse(sub_ids)
            chunk.write({'taxes_id': links})
            chunk.invalidate_recordset(['taxes_id'])

    def _force_default_purchase_tax(self, companies):
        default_supplier_taxes = companies.filtered('account_purchase_tax_id').account_purchase_tax_id
        if not default_supplier_taxes:
            return
        links = [Command.link(t.id) for t in default_supplier_taxes]
        for sub_ids in split_every(IN_MAX, self.ids):
            chunk = self.browse(sub_ids)
            chunk.write({'supplier_taxes_id': links})
            chunk.invalidate_recordset(['supplier_taxes_id'])

    def _force_default_tax(self, companies):
        self._force_default_sale_tax(companies)
        self._force_default_purchase_tax(companies)

    @api.model_create_multi
    def create(self, vals_list):
        products = super().create(vals_list)
        # If no company was set for the product, the product will be available for all companies and therefore should
        # have the default taxes of the other companies as well. sudo() is used since we're going to need to fetch all
        # the other companies default taxes which the user may not have access to.
        other_companies = self.env['res.company'].sudo().search(['!', ('id', 'child_of', self.env.companies.ids)])
        if other_companies and products:
            products_without_company = products.filtered(lambda p: not p.company_id and p.type != 'combo').sudo()
            products_without_company._force_default_tax(other_companies)
        return products

    def write(self, vals):
        res = super().write(vals)
        if vals.get('type') == 'combo':
            self.sudo().write({'taxes_id': [Command.clear()], 'supplier_taxes_id': [Command.clear()]})
        return res

    def _get_list_price(self, price):
        """ Get the product sales price from a public price based on taxes defined on the product """
        self.ensure_one()
        if not self.taxes_id:
            return super()._get_list_price(price)
        computed_price = self.taxes_id.compute_all(price, self.currency_id)
        total_included = computed_price["total_included"]

        if price == total_included:
            # Tax is configured as price included
            return total_included
        # calculate base from tax
        included_computed_price = self.taxes_id.with_context(force_price_include=True).compute_all(price, self.currency_id)
        return included_computed_price['total_excluded']

    def _get_price_diff_account(self):
        self.ensure_one()
        if self.cost_method == 'standard':
            return self.categ_id.property_price_difference_account_id
        return self.env['account.account']
