from dateutil.relativedelta import relativedelta
from odoo import _, api, fields, models, Command
from odoo.fields import Domain


class ResCompany(models.Model):
    _inherit = "res.company"

    account_stock_journal_id = fields.Many2one('account.journal', string='Stock Journal', check_company=True)

    account_stock_valuation_id = fields.Many2one('account.account', string='Stock Valuation Account', check_company=True)
    account_stock_variation_id = fields.Many2one(
        'account.account', string='Stock Variation Account', check_company=True,
        help="""
        - In AngloSaxon accounting, it's the purchase account, used to accumulate value during the period and empty to COGS at the end of period .
        - In Other accounting systems, it contains the stock variation between two periods.""")
    # COGS account is the default expense account for storable products
    account_cogs_id = fields.Many2one('account.account', string='COGS Account', check_company=True)

    account_production_wip_account_id = fields.Many2one('account.account', string='Production WIP Account', check_company=True)
    account_production_wip_overhead_account_id = fields.Many2one('account.account', string='Production WIP Overhead Account', check_company=True)

    inventory_period = fields.Selection(
        string='Inventory Period',
        selection=[
            ('manual', 'Manual'),
            ('daily', 'Daily'),
            ('monthly', 'Monthly'),
        ],
        default='manual',
        required=True)

    inventory_valuation = fields.Selection(
        string='Valuation',
        selection=[
            ('periodic', 'Periodic (at closing)'),
            ('real_time', 'Perpetual (at invoicing)'),
        ],
        default='periodic',
    )

    cost_method = fields.Selection(
        string="Cost Method",
        selection=[
            ('standard', "Standard Price"),
            ('fifo', "First In First Out (FIFO)"),
            ('average', "Average Cost (AVCO)"),
        ],
        default='standard',
        required=True,
    )

    def stock_value(self, products=False, product_categories=False):
        self.ensure_one()
        if products:
            return sum(products.with_company(self).mapped('total_value')), products
        domain = Domain([('is_storable', '=', True)])
        if product_categories:
            domain = domain & Domain([('categ_id', 'in', product_categories.ids)])
            products = self.env['product.product'].with_company(self).search(domain)
        else:
            products = self.env['product.product'].with_company(self).search(domain)
        return sum(products.mapped('total_value')), products

    def stock_accounting_value(self, products=False, product_categories=False):
        self.ensure_one()
        fiscal_year_date_from = self.compute_fiscalyear_dates(fields.Date.today())['date_from']
        stock_valuation_account = self.account_stock_valuation_id
        domain = Domain([
            ('account_id', '=', stock_valuation_account.id), ('parent_state', '=', 'posted'),
            ('company_id', '=', self.id),
            ('date', '>', fiscal_year_date_from),
        ])
        if products:
            domain = domain & Domain([('product_id', 'in', products.ids)])
        elif product_categories:
            domain = domain & Domain([('product_id.categ_id', 'in', product_categories.ids)])
        amls = self.env['account.move.line'].search(domain)
        return sum(amls.mapped('balance')), amls

    def post_stock_valuation(self, periodic_cogs=False):
        for company in self:
            fiscal_year_date_from = company.compute_fiscalyear_dates(fields.Date.today())['date_from']

            products = self.env['product.product'].with_company(company).search([('is_storable', '=', True)])

            stock_valuation_account = company.account_stock_valuation_id
            counter_balance_account = company.account_stock_variation_id
            if company.anglo_saxon_accounting:
                counter_balance_account = company.account_cogs_id

            company._post_stock_valuation_account(products, stock_valuation_account, counter_balance_account)
            if company.anglo_saxon_accounting:
                purchase_account = company.account_stock_variation_id
                company._post_periodic_cogs(products, fiscal_year_date_from, purchase_account, counter_balance_account)

    @api.model
    def _cron_post_stock_valuation(self):
        # get the last day of the current month
        domain = Domain([('inventory_period', '=', 'daily')])
        if fields.Date.today() == fields.Date.today() + relativedelta(day=31):
            domain = domain & Domain([('inventory_period', '=', 'monthly')])
        companies = self.env['res.company'].search(domain)
        companies.post_stock_valuation()

    def _post_stock_valuation_account(self, products, stock_valuation_account, stock_variation_account):
        """ Update the stock valuation account.
        - For products with periodic valuation, update the stock valuation base on the current balance and the inventory value
        - For products with perpetual valuation, Correct the COGS mistakes base on the accounting value and the real inventory value
        """
        if not products:
            return
        inventory_value = self.stock_value(products)[0]
        amls_value = self.stock_accounting_value()[0]

        inventory_variation = inventory_value
        if amls_value:
            inventory_variation -= amls_value

        if inventory_variation != 0:
            move_vals = {
                'journal_id': self.account_stock_journal_id.id,
                'date': fields.Date.context_today(self),
                'ref': _('Stock Valuation Closing'),
                'line_ids': [],
                'move_type': 'entry',
            }
            move_vals['line_ids'].append(Command.create({
                'account_id': stock_variation_account.id,
                'name': _('Stock Variation'),
                'debit': -inventory_variation if inventory_variation > 0 else 0,
                'credit': inventory_variation if inventory_variation < 0 else 0,
            }))
            move_vals['line_ids'].append(Command.create({
                'account_id': stock_valuation_account.id,
                'name': _('Stock Variation'),
                'debit': inventory_variation if inventory_variation > 0 else 0,
                'credit': -inventory_variation if inventory_variation < 0 else 0,
            }))
            am = self.env['account.move'].create(move_vals)
            am._post()

    def _post_periodic_cogs(self, products, fiscal_year_date_from, purchase_account, cogs_account):
        """ The `_post_stock_valuation_account` use the COGS account in order to balance the stock valuation account.
        However, the products could remains in stock and are not sold yet. This method counter balance the COGS account
        with the inventory value.
        """
        if not self.anglo_saxon_accounting:
            return

        amls = self.env['account.move.line'].search(
            domain=[
                ('account_id', '=', purchase_account.id), ('parent_state', '=', 'posted'),
                ('company_id', '=', self.id),
                ('date', '>', fiscal_year_date_from),
                '|', ('product_id.is_storable', '=', True), ('name', '=', _('COGS counter balance')),
            ],
        )
        amls_value = sum(amls.mapped('balance')) if amls else 0
        if not amls_value:
            return
        cogs_counter_balance = amls_value

        move_vals = {
            'journal_id': self.account_stock_journal_id.id,
            'date': fields.Date.context_today(self),
            'ref': _('Stock Valuation Closing. Adjust COGS account'),
            'line_ids': [],
            'move_type': 'entry',
        }
        move_vals['line_ids'].append(Command.create({
            'account_id': cogs_account.id,
            'name': _('COGS counter balance'),
            'debit': cogs_counter_balance if cogs_counter_balance > 0 else 0,
            'credit': cogs_counter_balance if cogs_counter_balance < 0 else 0,
        }))
        move_vals['line_ids'].append(Command.create({
            'account_id': purchase_account.id,
            'name': _('COGS counter balance'),
            'debit': -cogs_counter_balance if cogs_counter_balance > 0 else 0,
            'credit': cogs_counter_balance if cogs_counter_balance < 0 else 0,
        }))
        am = self.env['account.move'].create(move_vals)
        am._post()

    def _set_category_defaults(self):
        for company in self:
            self.env['ir.default'].set('product.category', 'property_valuation', company.inventory_valuation, company_id=company.id)
            self.env['ir.default'].set('product.category', 'property_cost_method', company.cost_method, company_id=company.id)
            self.env['ir.default'].set('product.category', 'property_stock_journal', company.account_stock_journal_id.id, company_id=company.id)
            self.env['ir.default'].set('product.category', 'property_stock_valuation_account_id', company.account_stock_valuation_id.id, company_id=company.id)
            self.env['ir.default'].set('product.category', 'property_stock_variation_account_id', company.account_stock_variation_id.id, company_id=company.id)
            self.env['ir.default'].set('product.category', 'property_cogs_account_id', company.account_cogs_id.id, company_id=company.id)
