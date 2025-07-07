from odoo import _, fields, models, Command


class ResCompany(models.Model):
    _inherit = "res.company"

    account_stock_journal_id = fields.Many2one('account.journal', string='Stock Journal', check_company=True)

    account_stock_valuation_id = fields.Many2one('account.account', string='Stock Valuation Account', check_company=True)
    account_stock_variation_id = fields.Many2one('account.account', string='Stock Variation Account', check_company=True)

    account_production_wip_account_id = fields.Many2one('account.account', string='Production WIP Account', check_company=True)
    account_production_wip_overhead_account_id = fields.Many2one('account.account', string='Production WIP Overhead Account', check_company=True)

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

    def post_stock_valuation(self, periodic_cogs=False):
        for company in self:
            fiscal_year_date_from = company.compute_fiscalyear_dates(fields.Date.today())['date_from']

            products = self.env['product.product'].with_company(company).search([('is_storable', '=', True)])

            stock_valuation_account = company.account_stock_valuation_id
            stock_variation_account = company.account_stock_variation_id
            purchase_account = self.env['account.account']
            if company.anglo_saxon_accounting:
                stock_variation_account = company.expense_account_id
                purchase_account = company.account_stock_variation_id

            company._post_stock_valuation_account(products, fiscal_year_date_from, stock_valuation_account, stock_variation_account)
            if periodic_cogs:
                company._post_periodic_cogs(products, fiscal_year_date_from, purchase_account, stock_variation_account)

    def _post_stock_valuation_account(self, products, fiscal_year_date_from, stock_valuation_account, stock_variation_account):
        """ Update the stock valuation account.
        - For products with periodic valuation, update the stock valuation base on the current balance and the inventory value
        - For products with perpetual valuation, Correct the COGS mistakes base on the accounting value and the real inventory value
        """
        if not products:
            return
        inventory_value = sum(products.mapped('total_value'))
        amls_value = self.env['account.move.line']._read_group(
            domain=[
                ('account_id', '=', stock_valuation_account.id), ('parent_state', '=', 'posted'),
                ('company_id', '=', self.id),
                ('date', '>', fiscal_year_date_from),
            ],
            groupby=['account_id'],
            aggregates=['balance:sum'],
        )

        inventory_variation = inventory_value
        if amls_value:
            inventory_variation -= amls_value[0][1]

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

    def _post_periodic_cogs(self, products, fiscal_year_date_from, purchase_account, stock_variation_account):
        """ The `_post_stock_valuation_account` use the COGS account in order to balance the stock valuation account.
        However, the products could remains in stock and are not sold yet. This method counter balance the COGS account
        with the inventory value.
        """
        if not self.anglo_saxon_accounting:
            return
        products_periodic = set()
        category_perpetual = self.env['product.category'].with_company(self).search([('property_valuation', '=', 'real_time')])
        products_periodic = products.filtered(lambda p: p.categ_id not in category_perpetual)

        if not products_periodic:
            return

        amls_value = self.env['account.move.line']._read_group(
            domain=[
                ('account_id', '=', purchase_account.id), ('parent_state', '=', 'posted'),
                ('company_id', '=', self.id),
                ('date', '>', fiscal_year_date_from),
                '|', ('product_id', 'in', products_periodic.ids), ('name', '=', _('COGS counter balance')),
            ],
            groupby=['account_id'],
            aggregates=['balance:sum'],
        )
        amls_value = amls_value[0][1] if amls_value else 0
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
            'account_id': stock_variation_account.id,
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
