# Part of Odoo. See LICENSE file for full copyright and licensing details.
import json
from dateutil.relativedelta import relativedelta

from odoo import Command, _, api, fields, models
from odoo.exceptions import UserError
from odoo.tools import date_utils, format_date


def ellipsis(string, size):
    if len(string) > size:
        return string[0:size - 3] + '...'
    return string


class AccountAccruedOrdersWizard(models.TransientModel):
    _name = 'account.accrued.orders.wizard'
    _description = 'Accrued Orders Wizard'
    _check_company_auto = True

    def _get_default_company(self):
        if not self.env.context.get('active_model'):
            return
        orders = self.env[self.env.context['active_model']].browse(self.env.context['active_ids'])
        return orders and orders[0].company_id.id

    def _get_default_date(self):
        return date_utils.get_month(fields.Date.context_today(self))[0] - relativedelta(days=1)

    company_id = fields.Many2one('res.company', default=_get_default_company)
    journal_id = fields.Many2one(
        comodel_name='account.journal',
        compute='_compute_journal_id', store=True, readonly=False, precompute=True,
        domain="[('type', '=', 'general')]",
        required=True,
        check_company=True,
        string='Journal',
    )
    date = fields.Date(default=_get_default_date, required=True)
    reversal_date = fields.Date(
        compute="_compute_reversal_date",
        required=True,
        readonly=False,
        store=True,
        precompute=True,
    )
    amount = fields.Monetary(string='Amount', help="Specify an arbitrary value that will be accrued on a \
        default account for the entire order, regardless of the products on the different lines.")
    currency_id = fields.Many2one(related='company_id.currency_id', string='Company Currency',
        readonly=True, store=True,
        help='Utility field to express amount currency')
    account_id = fields.Many2one(
        comodel_name='account.account',
        string='Accrual Account',
        check_company=True,
        domain="[('account_type', '=', 'liability_current')] if context.get('active_model') in ['purchase.order', 'purchase.order.line'] else [('account_type', '=', 'asset_current')]",
    )
    preview_data = fields.Text(compute='_compute_preview_data')
    display_amount = fields.Boolean(compute='_compute_display_amount')

    @api.depends('date', 'amount', 'account_id')
    def _compute_display_amount(self):
        single_order = len(self.env.context['active_ids']) == 1
        for record in self:
            preview_data = json.loads(self.preview_data)
            lines = preview_data.get('groups_vals', [])[0].get('items_vals', [])
            record.display_amount = record.amount or (single_order and not lines)

    @api.depends('date')
    def _compute_reversal_date(self):
        for record in self:
            if record.date and (not record.reversal_date or record.reversal_date <= record.date):
                record.reversal_date = record.date + relativedelta(days=1)
            else:
                record.reversal_date = record.reversal_date

    @api.depends('company_id')
    def _compute_journal_id(self):
        for record in self:
            record.journal_id = self.env['account.journal'].search([
                *self.env['account.journal']._check_company_domain(record.company_id),
                ('type', '=', 'general')
            ], limit=1)

    @api.depends('date', 'journal_id', 'account_id', 'amount')
    def _compute_preview_data(self):
        for record in self:
            preview_vals = [self.env['account.move']._move_dict_to_preview_vals(
                record._compute_move_vals()[0],
                record.company_id.currency_id,
            )]
            preview_columns = [
                {'field': 'account_id', 'label': _('Account')},
                {'field': 'name', 'label': _('Label')},
                {'field': 'debit', 'label': _('Debit'), 'class': 'text-end text-nowrap'},
                {'field': 'credit', 'label': _('Credit'), 'class': 'text-end text-nowrap'},
            ]
            record.preview_data = json.dumps({
                'groups_vals': preview_vals,
                'options': {
                    'columns': preview_columns,
                },
            })

    def _get_computed_account(self, order, product, is_purchase):
        accounts = product.with_company(order.company_id).product_tmpl_id.get_product_accounts(fiscal_pos=order.fiscal_position_id)
        if is_purchase:
            return accounts['expense']
        else:
            return accounts['income']

    def _get_aml_vals(self, is_purchase, order, balance, amount_currency, account_id, label="", analytic_distribution=None):
        # `balance`/`amount_currency` use the expense/income account's sign
        # convention (debit positive); flip for sale, whose entries mirror
        # the purchase ones.
        if not is_purchase:
            balance *= -1
            amount_currency *= -1
        values = {
            'name': label,
            'debit': balance if balance > 0 else 0.0,
            'credit': balance * -1 if balance < 0 else 0.0,
            'account_id': account_id,
        }
        if analytic_distribution:
            values.update({
                'analytic_distribution': analytic_distribution,
            })
        if len(order) == 1 and self.company_id.currency_id != order.currency_id:
            values.update({
                'amount_currency': amount_currency,
                'currency_id': order.currency_id.id,
            })
        return values

    def _get_accrual_line_ids(self, order, lines, accrual_entry_date):
        """ Of `lines` (candidates from a single order), the ones that still
        need an accrual as of `accrual_entry_date`. The amount check can't be
        a domain since it depends on the `accrual_entry_date` context.
        """
        candidate_lines = (lines & order.order_line).filtered_domain(lines._get_accrual_domain())
        dated_lines = candidate_lines.with_context(accrual_entry_date=accrual_entry_date)
        precision_digits = self.env['decimal.precision'].precision_get('Product Unit')
        return dated_lines.filtered(
            lambda l: fields.Float.compare(l.amount_to_invoice_at_date, 0, precision_digits=precision_digits) != 0
        )

    def _compute_move_vals(self):
        self.ensure_one()
        move_lines = []
        active_model = self.env.context.get('active_model')
        if active_model in ['purchase.order.line', 'sale.order.line']:
            lines = self.env[active_model].with_company(self.company_id).browse(self.env.context['active_ids'])
            orders = lines.order_id
        else:
            orders = self.env[active_model].with_company(self.company_id).browse(self.env.context['active_ids'])
            lines = orders.order_line.filtered(lambda x: x.product_id)
        is_purchase = orders._name == 'purchase.order'

        if orders.filtered(lambda o: o.company_id != self.company_id):
            raise UserError(_('Entries can only be created for a single company at a time.'))
        if orders.currency_id and len(orders.currency_id) > 1:
            raise UserError(_('Cannot create an accrual entry with orders in different currencies.'))
        orders_with_entries = []
        total_balance = 0.0

        for order, product_lines in lines.grouped('order_id').items():
            if len(orders) == 1 and product_lines and self.amount and order.order_line:
                total_balance = self.amount
                order_line = product_lines[0]
                account = self._get_computed_account(order, order_line.product_id, is_purchase)
                distribution = order_line.analytic_distribution if order_line.analytic_distribution else {}
                values = self._get_aml_vals(is_purchase, order, self.amount, 0, account.id, label=_('Manual entry'), analytic_distribution=distribution)
                move_lines.append(Command.create(values))
            else:
                accrual_entry_date = self.env.context.get('accrual_entry_date')
                accrual_entry_date = fields.Date.from_string(accrual_entry_date) if accrual_entry_date else self.date
                order_lines = self._get_accrual_line_ids(order, lines, accrual_entry_date)
                for order_line in order_lines:
                    for vals in self._get_accrual_line_vals(order, order_line, is_purchase, accrual_entry_date):
                        move_lines.append(Command.create(vals))

        # Manual amount case: a single globalized counterpart on the manually chosen account.
        if not self.company_id.currency_id.is_zero(total_balance):
            analytic_distribution = {}
            total = sum(order.amount_total for order in orders)
            for line in orders.order_line:
                ratio = line.price_total / total if total else 0.0
                if not line.analytic_distribution:
                    continue
                for account_id, distribution in line.analytic_distribution.items():
                    analytic_distribution.update({account_id : analytic_distribution.get(account_id, 0) + distribution*ratio})
            values = self._get_aml_vals(is_purchase, orders, -total_balance, 0.0, self.account_id.id, label=_('Accrued total'), analytic_distribution=analytic_distribution)
            move_lines.append(Command.create(values))

        move_type = _('Expense') if is_purchase else _('Revenue')
        move_vals = {
            'ref': _('Accrued %(entry_type)s entry as of %(date)s', entry_type=move_type, date=format_date(self.env, self.date)),
            'name': '/',
            'journal_id': self.journal_id.id,
            'date': self.date,
            'line_ids': move_lines,
            'currency_id': orders.currency_id.id or self.company_id.currency_id.id,
        }
        return move_vals, orders_with_entries

    def _get_accrual_message_body(self, move, reverse_move):
        self.ensure_one()
        return _(
            'Accrual entry created on %(date)s: %(accrual_entry)s.\
                And its reverse entry: %(reverse_entry)s.',
            date=self.date,
            accrual_entry=move._get_html_link(),
            reverse_entry=reverse_move._get_html_link(),
        )

    def create_entries(self, auto_post=True):
        self.ensure_one()

        if self.reversal_date <= self.date:
            raise UserError(_('Reversal date must be posterior to date.'))
        move_vals, orders_with_entries = self._compute_move_vals()
        move = self.env['account.move'].create(move_vals)
        reverse_move = move._reverse_moves(default_values_list=[{
            'ref': _('Reversal of: %s', move.ref),
            'name': '/',
            'date': self.reversal_date,
        }])
        if auto_post:
            move._post()
            reverse_move._post()
        for order in orders_with_entries:
            order.message_post(body=self._get_accrual_message_body(move, reverse_move))
        return {
            'name': _('Accrual Moves'),
            'type': 'ir.actions.act_window',
            'res_model': 'account.move',
            'view_mode': 'list,form',
            'domain': [('id', 'in', (move | reverse_move).ids)],
        }

    @api.model
    def _get_accrual_line_vals(self, order, order_line, is_purchase, accrual_entry_date):
        """ Hook overridden by purchase/sale (expense/income accrual, and further
        the perpetual-valuation reversal for storable, real-time products).

        :return: a list of account.move.line vals (each built via
            `_get_aml_vals`), ready for `Command.create`.
        """
        raise NotImplementedError
