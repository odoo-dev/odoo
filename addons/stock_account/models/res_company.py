from collections import defaultdict
from dateutil.relativedelta import relativedelta

from odoo import Command, _, api, fields, models
from odoo.fields import Domain
from odoo.exceptions import UserError


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

    def action_close_stock_valuation(self, auto_post=False, periodic_cogs=False, periodic_variation=True):
        self.ensure_one()
        moves_vals = []
        accounts_by_product = self._get_accounts_by_product()

        location_account_moves = self.env['account.move']

        vals_list = self._get_location_valuation_vals(accounts_by_product)
        if vals_list:
            # Needed directly since it will impact the accounting stock valuation.
            location_account_moves = self.env['account.move'].create(vals_list)

        # TODO: Use location_account_moves to reduce inventory account value
        vals_list = self._get_stock_valuation_account_vals(accounts_by_product)
        if vals_list:
            moves_vals += vals_list

        if self.anglo_saxon_accounting and periodic_cogs:
            vals_list = self._get_periodic_cogs_vals(accounts_by_product)
            if vals_list:
                moves_vals += vals_list
        if not self.anglo_saxon_accounting and periodic_variation:
            vals_list = self._get_periodic_expense_vals(accounts_by_product)
            if vals_list:
                moves_vals += vals_list

        if not moves_vals and not location_account_moves:
            # No account moves to create, so nothing to display.
            raise UserError(_("Nothing to close"))

        account_moves = self.env['account.move'].create(moves_vals)
        account_moves |= location_account_moves

        if auto_post:
            account_moves._post()

        action = {
            'type': 'ir.actions.act_window',
            'name': _("Journal Items"),
            'res_model': 'account.move',
            'domain': [('id', 'in', account_moves.ids)],
            'views': [(False, 'list'), (False, 'form')],
        }
        if len(account_moves.ids) == 1:
            action.update({
                'res_id': account_moves[0].id,
                'views': [(False, 'form')],
            })
        return action

    def stock_value(self, accounts_by_product=None, at_date=None):
        """ result: dict with format {
            'value': global value for the company
            'accounts': {
                'account_record': {
                    'value': total value for this account
                    'products': {
                        'product_record': {
                            'value': total value for this product
                        }
                    }
                }
            }
        }
        """
        self.ensure_one()
        total_value_by_account: dict = {
            'value': 0.0,
            'accounts': {},
        }
        if not accounts_by_product:
            accounts_by_product = self._get_accounts_by_product()
        for product, accounts in accounts_by_product.items():
            account = accounts['valuation']
            product_value = product.with_context(to_date=at_date).total_value
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

    def stock_accounting_value(self, accounts_by_product=None, at_date=None):
        """ Return the inventory accounting value for the company
        result: dict with format {
            'value': global value for the company
            'accounts': {
                'account_record': {
                    'value': total value for this account
                    'products': {
                        'product_record': {
                            'amls': amls specific to this product
                            'value': total value for this product
                        }
                    }
                    'company': {
                        'amls': amls without any product (company specific)
                        'value': total value for the company
                    }
                }
            }
        }
        """
        self.ensure_one()
        if not accounts_by_product:
            accounts_by_product = self._get_accounts_by_product()
        account_data = {
            'value': 0.0,
            'accounts': {},
        }
        stock_valuation_accounts_ids = set()
        for product, accounts in accounts_by_product.items():
            stock_valuation_accounts_ids.add(accounts['valuation'].id)
        stock_valuation_accounts = self.env['account.account'].browse(stock_valuation_accounts_ids)
        domain = Domain([
            ('account_id', 'in', stock_valuation_accounts.ids),
            ('company_id', '=', self.id),
            ('parent_state', '!=', 'cancel'),
            '|', ('parent_state', '=', 'posted'), ('move_type', 'not in', ['sale', 'purchase']),
        ])
        if at_date:
            domain = domain & Domain([('date', '<=', at_date)])
        amls_group = self.env['account.move.line']._read_group(domain, ['account_id', 'product_id'], ['balance:sum', 'id:recordset'])
        for account, product, balance, amls in amls_group:
            account_data['value'] += balance
            if account not in account_data['accounts']:
                account_data['accounts'][account] = {
                    'value': 0,
                    'products': {},
                    'company': {},
                }
            account_dict = account_data['accounts'][account]
            account_dict['value'] += balance
            amls_dict = {
                'value': balance,
                'aml_ids': amls.ids,
            }
            if product:
                account_dict['products'][product] = amls_dict
            else:
                account_dict['company'] = amls_dict
        return account_data

    @api.model
    def _cron_post_stock_valuation(self):
        # get the last day of the current month
        domain = Domain([('inventory_period', '=', 'daily')])
        if fields.Date.today() == fields.Date.today() + relativedelta(day=31):
            domain = domain & Domain([('inventory_period', '=', 'monthly')])
        companies = self.env['res.company'].search(domain)
        for company in companies:
            company.action_close_stock_valuation(auto_post=True)

    def _get_accounts_by_product(self, products=None):
        if not products:
            products = self.env['product.product'].with_company(self).search([('is_storable', '=', True)])

        accounts_by_product = {}
        for product in products:
            accounts = product._get_product_accounts()
            accounts_by_product[product] = {
                'valuation': accounts['stock_valuation'],
                'variation': accounts['stock_variation'],
                'expense': accounts['expense'],
            }
        return accounts_by_product

    def _get_company_accounting_value(self, account, details):
        return details['accounts'].get(account, {}).get('company', {}).get('value', 0)

    def _get_product_inventory_value(self, product, account, details):
        return details['accounts'].get(account, {}).get('products', {}).get(product, 0)

    def _get_product_accounting_value(self, product, account, details):
        return details['accounts'].get(account, {}).get('products', {}).get(product, {}).get('value', 0)

    def _get_location_valuation_vals(self, accounts_by_product):
        move_vals_list = []
        valued_location = self.env['stock.location'].search([('valuation_account_id', '!=', False)])
        quants_by_product_location = self.env['stock.quant']._read_group(
            [('location_id', 'in', valued_location.ids)],
            ['product_id', 'location_id'],
            ['quantity:sum'],
        )
        products = set()
        location_valuation = defaultdict(float)
        for product, location, quantity in quants_by_product_location:
            inventory_value = product._run_fifo(quantity, location=location)
            products.add(product.id)
            # 1. Get moves with fifo get stack and qty available at location
            # 2. Compare the value with existing aml
            # 3. Create aml for the difference
            location_valuation[product, location.valuation_account_id] += inventory_value
        products = self.env['product.product'].browse(products)
        current_valuation = self.env['account.move.line']._read_group(
            domain=[
                ('account_id', 'in', valued_location.valuation_account_id.ids),
                ('product_id', 'in', products.ids),
                ('company_id', '=', self.id),
                ('parent_state', '!=', 'cancel'),
            ],
            groupby=['product_id', 'account_id'],
            aggregates=['balance:sum'],
        )
        for product, account, balance in current_valuation:
            # TODO: Issue when multiple locations share same account
            location_valuation[product, account] -= balance
        for (product, account), balance in location_valuation.items():
            if balance == 0:
                continue
            move_vals = self._prepare_inventory_am_vals(
                account,
                accounts_by_product[product]['valuation'],
                balance,
                _('Closing: Location Reclassification - [%(product)s] to [%(account)s]', product=product.display_name, account=account.display_name),
                product_id=product.id,
            )
            move_vals_list.append(move_vals)
        return move_vals_list

    def _get_stock_valuation_account_vals(self, accounts_by_product):
        move_vals_list = []
        if not accounts_by_product:
            return move_vals_list

        company_valuation_acc = self.account_stock_valuation_id
        if self.anglo_saxon_accounting:
            company_variation_acc = self.account_cogs_id
        else:
            company_variation_acc = self.account_stock_variation_id

        inventory_data = self.stock_value(accounts_by_product)
        accounting_data = self.stock_accounting_value(accounts_by_product)

        # 1. Company Variation
        company_inventory_variation = 0
        product_specific_valorisation_list = []
        for product, accounts in accounts_by_product.items():
            product_valuation_acc = accounts['valuation']
            product_variation_acc = accounts['variation']
            if self.anglo_saxon_accounting:
                product_variation_acc = accounts['expense']

            if product_valuation_acc == company_valuation_acc and product_variation_acc == company_variation_acc:
                company_inventory_variation += self._get_product_inventory_value(product, product_valuation_acc, inventory_data)
                company_inventory_variation -= self._get_product_accounting_value(product, product_valuation_acc, accounting_data)
                continue

            product_specific_valorisation_list.append([product, product_valuation_acc, product_variation_acc])

        # Also remove the value that is not product specific
        company_accounting_valuation = self._get_company_accounting_value(company_valuation_acc, accounting_data)
        if company_accounting_valuation:
            company_inventory_variation -= company_accounting_valuation

        if company_inventory_variation:
            move_vals = self._prepare_inventory_am_vals(
                company_valuation_acc,
                company_variation_acc,
                company_inventory_variation,
                _('Closing: Stock Variation Global for company [%(company)s]', company=self.display_name),
            )
            move_vals_list.append(move_vals)

        if not product_specific_valorisation_list:
            return move_vals_list

        # 2. Product Specific Variation
        for product, valuation_acc, variation_acc in product_specific_valorisation_list:
            inventory_value = self._get_product_inventory_value(product, valuation_acc, inventory_data)
            account_value = self._get_product_accounting_value(product, variation_acc, accounting_data)
            variation = inventory_value - account_value
            if not variation:
                continue
            move_vals = self._prepare_inventory_am_vals(
                valuation_acc,
                variation_acc,
                variation,
                _('Closing: Stock Variation for product [%(product)s]', product=product.display_name),
                product_id=product.id,
            )
            move_vals_list.append(move_vals)
        return move_vals_list

    def _get_periodic_expense_vals(self, accounts_by_product):
        """ In periodic perpetual the inventory variation is never posted.
        This method compute the variation for a period and post it.
        """
        if self.anglo_saxon_accounting:
            return []

        fiscal_year_date_from = self.compute_fiscalyear_dates(fields.Date.today())['date_from']
        product_ids = set()
        valuation_account_ids = set()
        variation_account_ids = set()
        for product, accounts in accounts_by_product.items():
            if product.valuation != 'real_time':
                continue
            product_ids.add(product.id)
            valuation_account_ids.add(accounts['valuation'].id)
            variation_account_ids.add(accounts['variation'].id)

        valuation_over_period = self.env['account.move.line']._read_group(
            domain=[
                ('account_id', 'in', valuation_account_ids),
                ('product_id', 'in', product_ids),
                ('date', '>=', fiscal_year_date_from),
                ('parent_state', '=', 'posted'),
                ('company_id', '=', self.id),
            ],
            groupby=['product_id', 'account_id'],
            aggregates=['balance:sum'],
        )
        valuation_over_period = {
            (product, account): balance
            for product, account, balance in valuation_over_period
        }
        existing_variations = self.env['account.move.line']._read_group(
            domain=[
                ('account_id', 'in', variation_account_ids),
                ('product_id', 'in', product_ids),
                ('date', '>=', fiscal_year_date_from),
                ('parent_state', '!=', 'cancel'),
                ('company_id', '=', self.id),
            ],
            groupby=['product_id', 'account_id'],
            aggregates=['balance:sum'],
        )
        existing_variations = {
            (product, account): balance
            for product, account, balance in existing_variations
        }

        move_vals_list = []

        for product in self.env['product.product'].browse(product_ids):
            valuation_acc = accounts_by_product[product]['valuation']
            variation_acc = accounts_by_product[product]['variation']
            expense_acc = accounts_by_product[product]['expense']

            balance = valuation_over_period.get((product, valuation_acc), 0) - existing_variations.get((product, variation_acc), 0)
            if not balance:
                continue
            move_vals = self._prepare_inventory_am_vals(
                variation_acc,
                expense_acc,
                balance,
                _('Closing: Stock Variation for [%(product)s]', product=product.display_name),
                product_id=product.id,
            )
            move_vals_list.append(move_vals)

        return move_vals_list

    def _get_periodic_cogs_vals(self, accounts_by_product):
        if not self.anglo_saxon_accounting:
            return False

        purchase_accounts = self.env['account.account']
        product_ids = set()
        for product, accounts in accounts_by_product.items():
            if product.valuation != 'periodic':
                continue
            product_ids.add(product.id)
            purchase_accounts += accounts['variation']
        amls_group = self.env['account.move.line']._read_group(
            domain=[
                ('account_id', 'in', purchase_accounts.ids), ('parent_state', '=', 'posted'),
                ('company_id', '=', self.id),
                ('product_id', 'in', product_ids),
            ],
            groupby=['product_id'],
            aggregates=['balance:sum'],
        )
        am_vals_list = []
        for product, balance in amls_group:
            if not balance:
                continue
            cogs_acc = accounts_by_product[product]['expense']
            purchase_acc = accounts_by_product[product]['variation']
            move_vals = self._prepare_inventory_am_vals(
                cogs_acc,
                purchase_acc,
                balance,
                _('Closing: Empty purchase account for product: [%(product)s]', product=product.display_name),
                product_id=product.id)
            am_vals_list.append(move_vals)
        return am_vals_list

    def _prepare_inventory_am_vals(self, debit_acc, credit_acc, balance, ref, product_id=False):
        move_vals = {
            'journal_id': self.account_stock_journal_id.id,
            'date': fields.Date.context_today(self),
            'ref': ref,
            'line_ids': [],
            'move_type': 'entry',
        }
        move_vals['line_ids'].append(Command.create({
            'account_id': credit_acc.id,
            'name': ref,
            'debit': -balance if balance > 0 else 0,
            'credit': balance if balance < 0 else 0,
            'product_id': product_id,
        }))
        move_vals['line_ids'].append(Command.create({
            'account_id': debit_acc.id,
            'name': ref,
            'debit': balance if balance > 0 else 0,
            'credit': -balance if balance < 0 else 0,
            'product_id': product_id,
        }))
        return move_vals

    def _set_category_defaults(self):
        for company in self:
            self.env['ir.default'].set('product.category', 'property_valuation', company.inventory_valuation, company_id=company.id)
            self.env['ir.default'].set('product.category', 'property_cost_method', company.cost_method, company_id=company.id)
            self.env['ir.default'].set('product.category', 'property_stock_journal', company.account_stock_journal_id.id, company_id=company.id)
            self.env['ir.default'].set('product.category', 'property_stock_valuation_account_id', company.account_stock_valuation_id.id, company_id=company.id)
            self.env['ir.default'].set('product.category', 'property_stock_variation_account_id', company.account_stock_variation_id.id, company_id=company.id)
            self.env['ir.default'].set('product.category', 'property_cogs_account_id', company.account_cogs_id.id, company_id=company.id)
