from dateutil.relativedelta import relativedelta

from odoo import Command, _, api, fields, models
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

    def stock_value(self, products=None, product_categories=None, at_date=None):
        """ Returns the inventory value of the products. Base on quantity in inventory
        and the value on available accounting documents.
        The result is grouped by account (defined on the product).
        """
        self.ensure_one()
        total_value_by_account: dict = {
            'value': 0.0,
            'accounts': {},
        }
        if products:
            products = products.with_company(self).with_context(to_date=at_date)
            return total_value_by_account
        domain = Domain([('is_storable', '=', True)])
        if product_categories:
            domain = domain & Domain([('categ_id', 'in', product_categories.ids)])
        products = self.env['product.product'].with_company(self).search(domain)
        products = products.with_company(self).with_context(to_date=at_date)
        for product in products:
            account = product._get_product_accounts()['stock_valuation']
            product_value = product.total_value
            if account not in total_value_by_account['accounts']:
                total_value_by_account['accounts'][account] = {
                    'value': 0.0,
                    'products': {},
                }
            account_dict = total_value_by_account['accounts'][account]
            account_dict['products'][product] = product_value
            account_dict['value'] += product_value
            total_value_by_account['value'] += product_value
        return total_value_by_account

    def stock_accounting_value(self, products=None, product_categories=None, at_date=None):
        """ Return the inventory accounting value for the company
        result: dict with format {
            'value': global value for the company
            'accounts': {
                'account_name': {
                    'value': total value for this account
                    'amls': recorset of all account move lines in this account
                }
            }
        }
        """
        self.ensure_one()
        if not products:
            products = self.env['product.product'].with_company(self).search([('is_storable', '=', True)])
        stock_valuation_accounts_ids = set()
        for product in products:
            account = product._get_product_accounts()['stock_valuation']
            stock_valuation_accounts_ids.add(account.id)
        stock_valuation_accounts = self.env['account.account'].browse(stock_valuation_accounts_ids)
        domain = Domain([
            ('account_id', 'in', stock_valuation_accounts.ids), ('parent_state', '=', 'posted'),
            ('company_id', '=', self.id),
        ])
        if at_date:
            domain = domain & Domain([('date', '<=', at_date)])
        if products:
            domain = domain & Domain([('product_id', 'in', products.ids)])
        elif product_categories:
            domain = domain & Domain([('product_id.categ_id', 'in', product_categories.ids)])
        amls_group = self.env['account.move.line']._read_group(domain, ['account_id'], ['balance:sum', 'id:recordset'])
        res = {'value': 0.0, 'accounts': {}}
        for account, (balance, amls) in amls_group:
            res['value'] += balance
            res['accounts'][account] = {
                'value': balance,
                'account_move_lines': amls,
            }
        return res

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
            else:
                realtime_products = products.filtered(lambda p: p.valuation == 'real_time')
                company._post_periodic_expense(realtime_products, fiscal_year_date_from, stock_valuation_account, company.account_stock_variation_id, company.expense_account_id)

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
        import pudb; pudb.set_trace()
        inventory_value = self.stock_value(products)['value']
        amls_value = self.stock_accounting_value()['value']

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

    def _post_specific_location_account(self):
        return

    def _post_periodic_expense(self, products, fiscal_year_date_from, stock_valuation_account, stock_variation_account, expense_account):
        """ The `_post_stock_valuation_account` use the COGS account in order to balance the stock valuation account.
        However, the products could remains in stock and are not sold yet. This method counter balance the COGS account
        with the inventory value.
        """
        if self.anglo_saxon_accounting:
            return
        existing_am = self.env['account.move'].search([
            ('line_ids.account_id', '=', expense_account.id),
            ('line_ids.account_id', '=', stock_variation_account.id),
            ('date', '>', fiscal_year_date_from),
            ('state', '=', 'posted'),
            ('company_id', '=', self.id),
        ])

        inventory_variation_balance = sum(line.balance for line in existing_am.line_ids if line.account_id == stock_variation_account)
        inventory_value = self.stock_value(products)[0] if products else 0
        inventory_value_at_beginning = self.env['account.move.line']._read_group(
            domain=[
                ('account_id', '=', stock_valuation_account.id),
                ('parent_state', '=', 'posted'),
                ('company_id', '=', self.id),
                ('date', '<=', fiscal_year_date_from),
            ],
            groupby=['account_id'],
            aggregates=['balance:sum'],
        )
        balance = inventory_value - (inventory_value_at_beginning[0]['balance'] if inventory_value_at_beginning else 0) - inventory_variation_balance
        if not balance:
            return
        move_vals = {
            'journal_id': self.account_stock_journal_id.id,
            'date': fields.Date.context_today(self),
            'ref': _('Balance expense with inventory variation'),
            'line_ids': [],
            'move_type': 'entry',
        }
        move_vals['line_ids'].append(Command.create({
            'account_id': stock_variation_account.id,
            'name': _('Counter balance expense with inventory variation'),
            'debit': balance if balance > 0 else 0,
            'credit': balance if balance < 0 else 0,
        }))
        move_vals['line_ids'].append(Command.create({
            'account_id': expense_account.id,
            'name': _('Counter balance expense with inventory variation'),
            'debit': balance if balance < 0 else 0,
            'credit': balance if balance > 0 else 0,
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
            'debit': cogs_counter_balance if cogs_counter_balance < 0 else 0,
            'credit': cogs_counter_balance if cogs_counter_balance > 0 else 0,
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
