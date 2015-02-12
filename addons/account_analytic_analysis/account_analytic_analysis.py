# -*- coding: utf-8 -*-

from dateutil.relativedelta import relativedelta
import datetime
import logging
import openerp

from openerp import api, fields, models, _
from openerp.exceptions import UserError
from openerp.addons.decimal_precision import decimal_precision as dp

_logger = logging.getLogger(__name__)

class AccountAnalyticInvoiceLine(models.Model):
    _name = "account.analytic.invoice.line"

    @api.multi
    @api.depends('quantity', 'price_unit', 'analytic_account_id', 'analytic_account_id.pricelist_id')
    def _amount_line(self):
        for line in self:
            price_subtotal = line.quantity * line.price_unit
            if line.analytic_account_id.pricelist_id:
                 price_subtotal = line.analytic_account_id.pricelist_id.currency_id.round(price_subtotal)
            line.price_subtotal = price_subtotal

    product_id = fields.Many2one('product.product', string='Product', required=True)
    analytic_account_id = fields.Many2one('account.analytic.account', string='Analytic Account')
    name = fields.Text(string='Description', required=True)
    quantity = fields.Float(string='Quantity', required=True, default=1)
    uom_id = fields.Many2one('product.uom', string='Unit of Measure', required=True)
    price_unit = fields.Float(string='Unit Price', required=True)
    price_subtotal = fields.Float(compute='_amount_line', string='Sub Total', digits=0)

    @api.onchange('product_id')
    def product_id_change(self):
        if not self.product_id:
            return {'value': {'price_unit': 0.0 }, 'domain' : {'product_uom' : []}}
        ProductUom = self.env['product.uom']
        company_id = self.env.user.company_id.id

        part = self.analytic_account_id.partner_id.with_context(company_id=company_id, force_company=company_id, pricelist=self.analytic_account_id.pricelist_id.id)
        if part.lang:
            self.with_context(lang=part.lang)
        res = self.product_id.with_context(company_id=company_id, force_company=company_id, pricelist=self.analytic_account_id.pricelist_id.id)
        price = 0.0

        if self.analytic_account_id.pricelist_id:
            price = res.price
        if not price:
            price = res.list_price

        self.name = self.product_id.name_get()[0][1]
        if res.description_sale:
            self.name += '\n' + res.description_sale
        self.uom_id = self.product_id.uom_id.id
        self.price_unit = price
        if self.uom_id.id != res.uom_id.id:
            selected_uom = self.uom_id.with_context(company_id=company_id, force_company=company_id, pricelist=self.analytic_account_id.pricelist_id.id)
            new_price = ProductUom._compute_price(res.uom_id.id, self.price_unit, self.uom_id.id)
            self.price_unit = new_price


class account_analytic_account(models.Model):
    _name = "account.analytic.account"
    _inherit = "account.analytic.account"

    @api.multi
    @api.depends('ca_to_invoice', 'ca_theorical', 'hours_qtt_non_invoiced', 'hours_quantity', 'last_invoice_date', 'last_worked_invoiced_date', 'last_worked_date', 'month_ids', 'user_ids')
    def _analysis_all(self):
        dp = 2
        User = self.env['res.users']
        SummaryUser = self.env['account_analytic_analysis.summary.user']
        parent_ids = tuple(self.ids) #We don't want consolidation for each of these fields because those complex computation is resource-greedy.
        for account in self:
            max_user = max(User.search([]).ids)
            if parent_ids:
                result = list(set(SummaryUser.search(['&',('account_id', 'in', parent_ids),('unit_amount', '!=', 0.0)]).user))
                self._cr.execute('SELECT DISTINCT(month_id) FROM account_analytic_analysis_summary_month ' \
                           'WHERE account_id IN %s AND unit_amount <> 0.0', (parent_ids,))
                result1 = self._cr.fetchall()

                self._cr.execute("SELECT account_analytic_line.account_id, MAX(date) \
                        FROM account_analytic_line \
                        WHERE account_id IN %s \
                            AND invoice_id IS NOT NULL \
                        GROUP BY account_analytic_line.account_id;", (parent_ids,))

                for account_id, sum in self._cr.fetchall():
                    if account_id not in self.ids:
                        account.last_worked_invoiced_date = False
                    account.last_worked_invoiced_date = sum

                self._cr.execute ("SELECT account_analytic_line.account_id, \
                            DATE(MAX(account_invoice.date_invoice)) \
                        FROM account_analytic_line \
                        JOIN account_invoice \
                            ON account_analytic_line.invoice_id = account_invoice.id \
                        WHERE account_analytic_line.account_id IN %s \
                            AND account_analytic_line.invoice_id IS NOT NULL \
                        GROUP BY account_analytic_line.account_id",(parent_ids,))
                for account_id, lid in self._cr.fetchall():
                    account.last_invoice_date = lid

                self._cr.execute("SELECT account_analytic_line.account_id, MAX(date) \
                        FROM account_analytic_line \
                        WHERE account_id IN %s \
                            AND invoice_id IS NULL \
                        GROUP BY account_analytic_line.account_id",(parent_ids,))

                for account_id, lwd in self._cr.fetchall():
                    if account_id not in self.ids:
                        account.last_worked_date = False
                    account.last_worked_date = lwd

                self._cr.execute("SELECT account_analytic_line.account_id, COALESCE(SUM(unit_amount), 0.0) \
                        FROM account_analytic_line \
                        JOIN account_analytic_journal \
                            ON account_analytic_line.journal_id = account_analytic_journal.id \
                        WHERE account_analytic_line.account_id IN %s \
                            AND account_analytic_journal.type='general' \
                            AND invoice_id IS NULL \
                            AND to_invoice IS NOT NULL \
                        GROUP BY account_analytic_line.account_id;",(parent_ids,))

                for account_id, sua in self._cr.fetchall():
                    if account_id not in self.ids:
                        account.hours_qtt_non_invoiced = False
                    account.hours_qtt_non_invoiced = round(sua, dp)


                self._cr.execute("SELECT account_analytic_line.account_id, COALESCE(SUM(unit_amount), 0.0) \
                        FROM account_analytic_line \
                        JOIN account_analytic_journal \
                            ON account_analytic_line.journal_id = account_analytic_journal.id \
                        WHERE account_analytic_line.account_id IN %s \
                            AND account_analytic_journal.type='general' \
                        GROUP BY account_analytic_line.account_id",(parent_ids,))

                for account_id, hq in self._cr.fetchall():
                    if account_id not in self.ids:
                        self.hours_quantity = 0.0
                    account.hours_quantity = round(hq, dp)

                self._cr.execute("""SELECT account_analytic_line.account_id AS account_id, \
                            COALESCE(SUM((account_analytic_line.unit_amount * pt.list_price) \
                                - (account_analytic_line.unit_amount * pt.list_price \
                                    * hr.factor)), 0.0) AS somme
                        FROM account_analytic_line \
                        LEFT JOIN account_analytic_journal \
                            ON (account_analytic_line.journal_id = account_analytic_journal.id) \
                        JOIN product_product pp \
                            ON (account_analytic_line.product_id = pp.id) \
                        JOIN product_template pt \
                            ON (pp.product_tmpl_id = pt.id) \
                        JOIN account_analytic_account a \
                            ON (a.id=account_analytic_line.account_id) \
                        JOIN hr_timesheet_invoice_factor hr \
                            ON (hr.id=a.to_invoice) \
                    WHERE account_analytic_line.account_id IN %s \
                        AND a.to_invoice IS NOT NULL \
                        AND account_analytic_journal.type IN ('purchase', 'general')
                    GROUP BY account_analytic_line.account_id""",(parent_ids,))

                for account_id, sum in self._cr.fetchall():
                    account.ca_theorical = round(sum, dp)

            else:
                result = []
                result1 = []
            account.user_ids = [int((account.id * max_user) + x.id) for x in result]
            account.month_ids = [int(account.id * 1000000 + x[0]) for x in result1]
            if account.ids:
                self._cr.execute("""
                    SELECT product_id, sum(amount), user_id, to_invoice, sum(unit_amount), product_uom_id, line.name
                    FROM account_analytic_line line
                        LEFT JOIN account_analytic_journal journal ON (journal.id = line.journal_id)
                    WHERE account_id = %s
                        AND journal.type != 'purchase'
                        AND invoice_id IS NULL
                        AND to_invoice IS NOT NULL
                    GROUP BY product_id, user_id, to_invoice, product_uom_id, line.name""", (account.id,))

                ca_t_invoice = 0.0
                for product_id, price, user_id, factor_id, qty, uom, line_name in self._cr.fetchall():
                    price = -price
                    if product_id:
                        price = self.env['account.analytic.line']._get_invoice_price(account, product_id, user_id, qty)
                    factor = self.env['hr_timesheet_invoice.factor'].browse(factor_id)
                    ca_t_invoice += price * qty * (100-factor.factor or 0.0) / 100.0
                    account.ca_to_invoice = round(ca_t_invoice, dp)


    @api.multi
    @api.depends('ca_invoiced', 'fix_price_invoices','timesheet_ca_invoiced')
    def _ca_invoiced_calc(self):
        for account in self:
            ca_invoice = 0.0
            #Search all invoice lines not in cancelled state that refer to this analytic account
            InvoiceLines = self.env["account.invoice.line"].search(['&', ('account_analytic_id', 'in', self.ids), ('invoice_id.state', 'not in', ['draft', 'cancel']), ('invoice_id.type', 'in', ['out_invoice', 'out_refund'])])
            for line in InvoiceLines:
                if line.invoice_id.type == 'out_refund':
                    ca_invoice -= line.price_subtotal
                else:
                    ca_invoice += line.price_subtotal
                ca_invoice -= (account.timesheet_ca_invoiced or 0.0)
            account.ca_invoiced = ca_invoice

    @api.multi
    @api.depends('total_cost')
    def _total_cost_calc(self):
        for child_id in self.child_ids:
            child_id.total_cost = 0.0
        if self.child_ids:
            self._cr.execute("""SELECT account_analytic_line.account_id, COALESCE(SUM(amount), 0.0) \
                    FROM account_analytic_line \
                    JOIN account_analytic_journal \
                        ON account_analytic_line.journal_id = account_analytic_journal.id \
                    WHERE account_analytic_line.account_id IN %s \
                        AND amount<0 \
                    GROUP BY account_analytic_line.account_id""",(self.child_ids,))
            for account_id, sum in self._cr.fetchall():
                self.total_cost = round(sum, 2)

    @api.multi
    @api.depends('quantity_max', 'hours_quantity', 'remaining_hours')
    def _remaining_hours_calc(self):
        rem_hours = 0.0
        for account in self:
            if account.quantity_max != 0:
                rem_hours = account.quantity_max - account.hours_quantity
            else:
                rem_hours = 0.0
            account.remaining_hours = round(rem_hours, 2)

    @api.multi
    @api.depends('hours_qtt_est', 'timesheet_ca_invoiced', 'ca_to_invoice', 'remaining_hours_to_invoice')
    def _remaining_hours_to_invoice_calc(self):
        for account in self:
            account.remaining_hours_to_invoice = max(account.hours_qtt_est - account.timesheet_ca_invoiced, account.ca_to_invoice)

    @api.multi
    @api.depends('hours_qtt_invoiced', 'hours_quantity')
    def _hours_qtt_invoiced_calc(self):
        hours_qtt_invoice = 0.0
        for account in self:
            hours_qtt_invoice = account.hours_quantity - account.hours_qtt_non_invoiced
            if account.hours_qtt_invoiced < 0:
                hours_qtt_invoice = 0.0
            account.hours_qtt_invoiced = round(hours_qtt_invoice, 2)

    @api.multi
    @api.depends('hours_qtt_invoiced', 'ca_invoiced', 'hours_qtt_invoiced', 'revenue_per_hour')
    def _revenue_per_hour_calc(self):
        revenue_p_hour = 0.0
        for account in self:
            if account.hours_qtt_invoiced == 0:
                revenue_p_hour = 0.0
            else:
                revenue_p_hour = account.ca_invoiced / account.hours_qtt_invoiced
            account.revenue_per_hour = round(revenue_p_hour, 2)

    @api.multi
    @api.depends('ca_invoiced', 'total_cost', 'real_margin', 'total_cost')
    def _real_margin_rate_calc(self):
        real_mar_rate = 0.0
        for account in self:
            if account.ca_invoiced == 0:
                real_mar_rate = 0.0
            elif account.total_cost != 0.0:
                real_mar_rate = -(account.real_margin / account.total_cost) * 100
            else:
                real_mar_rate = 0.0
            account.real_margin_rate = round(real_mar_rate, 2)

    @api.multi
    @api.depends('fix_price_to_invoice')
    def _fix_price_to_invoice_calc(self):
        SaleOrder = self.env['sale.order']
        for account in self:
            fix_price_to_inv = 0.0
            SalesOrders = SaleOrder.search([('project_id', '=', account.id), ('state', '=', 'manual')])
            for sale in SalesOrders:
                fix_price_to_inv += sale.amount_untaxed
                for invoice in sale.invoice_ids:
                    if invoice.state != 'cancel':
                        fix_price_to_inv -= invoice.amount_untaxed
            account.fix_price_to_invoice = fix_price_to_inv

    @api.multi
    @api.depends('timesheet_ca_invoiced')
    def _timesheet_ca_invoiced_calc(self):
        AccountAnalyticLine = self.env['account.analytic.line']
        inv_ids = []
        for account in self:
            timesheet_ca_inv = 0.0
            Lines = AccountAnalyticLine.search([('account_id', '=', account.id), ('invoice_id', '!=', False), ('to_invoice', '!=', False), ('journal_id.type', '=', 'general'), ('invoice_id.type', 'in', ['out_invoice', 'out_refund'])])
            for line in Lines:
                if line.invoice_id not in inv_ids:
                    inv_ids.append(line.invoice_id)
                    if line.invoice_id.type == 'out_refund':
                        timesheet_ca_inv -= line.invoice_id.amount_untaxed
                    else:
                        timesheet_ca_inv += line.invoice_id.amount_untaxed
            account.timesheet_ca_invoiced = timesheet_ca_inv

    @api.multi
    @api.depends('amount_max', 'ca_invoiced', 'fix_price_to_invoice', 'remaining_ca')
    def _remaining_ca_calc(self):
        for account in self:
            account.remaining_ca = max(account.amount_max - account.ca_invoiced, account.fix_price_to_invoice)

    @api.multi
    @api.depends('ca_invoiced', 'total_cost', 'real_margin')
    def _real_margin_calc(self):
        for account in self:
            account.real_margin = round((account.ca_invoiced + account.total_cost), 2)

    @api.multi
    @api.depends('ca_theorical', 'total_cost', 'theorical_margin')
    def _theorical_margin_calc(self):
        for account in self:
            account.theorical_margin = round((account.ca_theorical + account.total_cost), 2)

    @api.multi
    @api.depends('quantity_max', 'hours_quantity', 'quantity_max', 'is_overdue_quantity')
    def _is_overdue_quantity(self):
        for record in self:
            if record.quantity_max > 0.0:
                record.is_overdue_quantity = int(record.hours_quantity > record.quantity_max)
            else:
                record.is_overdue_quantity = 0

    @api.multi
    def _get_total_estimation(self):
        tot_est = 0.0
        for account in self:
            if account.fix_price_invoices:
                tot_est += account.amount_max
            if account.invoice_on_timesheets:
                tot_est += account.hours_qtt_est
        return tot_est

    @api.multi
    def _get_total_invoiced(self):
        total_invoiced = 0.0
        for account in self:
            if account.fix_price_invoices:
                total_invoiced += account.ca_invoiced
            if account.invoice_on_timesheets:
                total_invoiced += account.timesheet_ca_invoiced
        return total_invoiced

    @api.multi
    def _get_total_remaining(self):
        total_remaining = 0.0
        for account in self:
            if account.fix_price_invoices:
                total_remaining += account.remaining_ca
            if account.invoice_on_timesheets:
                total_remaining += account.remaining_hours_to_invoice
        return total_remaining

    @api.multi
    def _get_total_toinvoice(self):
        total_toinvoice = 0.0
        for account in self:
            if account.fix_price_invoices:
                total_toinvoice += account.fix_price_to_invoice
            if account.invoice_on_timesheets:
                total_toinvoice += account.ca_to_invoice
        return total_toinvoice

    @api.multi
    @api.depends('est_total', 'invoiced_total', 'remaining_total', 'toinvoice_total')
    def _sum_of_fields(self):
        for account in self:
            account.est_total = account._get_total_estimation()
            account.invoiced_total = account._get_total_invoiced()
            account.remaining_total = account._get_total_remaining()
            account.toinvoice_total = account._get_total_toinvoice()

    is_overdue_quantity = fields.Boolean(compute='_is_overdue_quantity', string='Overdue Quantity', store=True)
    ca_invoiced = fields.Float(compute='_ca_invoiced_calc', string='Invoiced Amount',
        help="Total customer invoiced amount for this account.",
        digits=0)
    total_cost = fields.Float(compute='_total_cost_calc', string='Total Costs',
        help="Total of costs for this account. It includes real costs (from invoices) and indirect costs, like time spent on timesheets.",
        digits=0)
    ca_to_invoice = fields.Float(compute='_analysis_all', string='Uninvoiced Amount',
        help="If invoice from analytic account, the remaining amount you can invoice to the customer based on the total costs.",
        digits=0)
    ca_theorical = fields.Float(compute='_analysis_all', string='Theoretical Revenue',
        help="Based on the costs you had on the project, what would have been the revenue if all these costs have been invoiced at the normal sale price provided by the pricelist.",
        digits=0)
    hours_quantity = fields.Float(compute='_analysis_all', string='Total Worked Time',
        help="Number of time you spent on the analytic account (from timesheet). It computes quantities on all journal of type 'general'.")
    last_invoice_date = fields.Date(compute='_analysis_all', string='Last Invoice Date',
        help="If invoice from the costs, this is the date of the latest invoiced.")
    last_worked_invoiced_date = fields.Date(compute='_analysis_all', string='Date of Last Invoiced Cost',
        help="If invoice from the costs, this is the date of the latest work or cost that have been invoiced.")
    last_worked_date = fields.Date(compute='_analysis_all', string='Date of Last Cost/Work',
        help="Date of the latest work done on this account.")
    hours_qtt_non_invoiced = fields.Float(compute='_analysis_all', string='Uninvoiced Time',
        help="Number of time (hours/days) (from journal of type 'general') that can be invoiced if you invoice based on analytic account.")
    hours_qtt_invoiced = fields.Float(compute='_hours_qtt_invoiced_calc', string='Invoiced Time',
        help="Number of time (hours/days) that can be invoiced plus those that already have been invoiced.")
    remaining_hours = fields.Float(compute='_remaining_hours_calc', string='Remaining Time',
        help="Computed using the formula: Maximum Time - Total Worked Time")
    remaining_hours_to_invoice = fields.Float(compute='_remaining_hours_to_invoice_calc', string='Remaining Time',
        help="Computed using the formula: Expected on timesheets - Total invoiced on timesheets")
    fix_price_to_invoice = fields.Float(compute='_fix_price_to_invoice_calc', string='Remaining Time',
        help="Sum of quotations for this contract.")
    timesheet_ca_invoiced = fields.Float(compute='_timesheet_ca_invoiced_calc', string='Remaining Time',
        help="Sum of timesheet lines invoiced for this contract.")
    remaining_ca = fields.Float(compute='_remaining_ca_calc', string='Remaining Revenue',
        help="Computed using the formula: Max Invoice Price - Invoiced Amount.",
        digits=0)
    revenue_per_hour = fields.Float(compute='_revenue_per_hour_calc', string='Revenue per Time (real)',
        help="Computed using the formula: Invoiced Amount / Total Time",
        digits=0)
    real_margin = fields.Float(compute='_real_margin_calc', string='Real Margin',
        help="Computed using the formula: Invoiced Amount - Total Costs.",
        digits=0)
    theorical_margin = fields.Float(compute='_theorical_margin_calc', string='Theoretical Margin',
        help="Computed using the formula: Theoretical Revenue - Total Costs",
        digits=0)
    real_margin_rate = fields.Float(compute='_real_margin_rate_calc', string='Real Margin Rate (%)',
        help="Computes using the formula: (Real Margin / Total Costs) * 100.",
        digits=0)
    fix_price_invoices = fields.Boolean('Fixed Price')
    month_ids = fields.Many2one('account_analytic_analysis.summary.month', compute='_analysis_all', string='Month')
    user_ids = fields.Many2one('account_analytic_analysis.summary.user', compute='_analysis_all', string='User')
    hours_qtt_est = fields.Float('Estimation of Hours to Invoice')
    est_total = fields.Float(compute='_sum_of_fields', string="Total Estimation")
    invoiced_total = fields.Float(compute='_sum_of_fields', string="Total Invoiced")
    remaining_total = fields.Float(compute='_sum_of_fields', string="Total Remaining", help="Expectation of remaining income for this contract. Computed as the sum of remaining subtotals which, in turn, are computed as the maximum between '(Estimation - Invoiced)' and 'To Invoice' amounts")
    toinvoice_total = fields.Float(compute='_sum_of_fields', string="Total to Invoice", help=" Sum of everything that could be invoiced for this contract.")
    recurring_invoice_line_ids = fields.One2many('account.analytic.invoice.line', 'analytic_account_id', string='Invoice Lines', copy=True)
    recurring_invoices = fields.Boolean(string='Generate recurring invoices automatically')
    recurring_rule_type = fields.Selection([
        ('daily', 'Day(s)'),
        ('weekly', 'Week(s)'),
        ('monthly', 'Month(s)'),
        ('yearly', 'Year(s)'),
        ], 'Recurrency', help="Invoice automatically repeat at specified interval", default='monthly')
    recurring_interval = fields.Integer('Repeat Every', help="Repeat every (Days/Week/Month/Year)", default=1)
    recurring_next_date = fields.Date('Date of Next Invoice', default=fields.Date.context_today)

    @api.multi
    def open_sale_order_lines(self):
        SaleOrders = self.env['sale.order'].search([('project_id', '=' , self._context.get('search_default_project_id')),('partner_id', 'in' , self._context.get('search_default_partner_id'))])
        names = [record.name for record in self]
        name = _('Sales Order Lines to Invoice of %s') % ','.join(names)
        return {
            'type': 'ir.actions.act_window',
            'name': name,
            'view_type': 'form',
            'view_mode': 'tree,form',
            'context': self._context,
            'domain': [('order_id', 'in', SaleOrders.ids)],
            'res_model': 'sale.order.line',
            'nodestroy': True,
        }

    @api.onchange('template_id')
    def on_change_template(self):
        if not self.template_id:
            return {}
        super(account_analytic_account, self).on_change_template()
        if self.template_id.to_invoice.id:
            self.to_invoice = self.template_id.to_invoice.id
        if self.template_id.pricelist_id.id:
            self.pricelist_id = self.template_id.pricelist_id.id
        if not self.ids:
            self.fix_price_invoices = self.template_id.fix_price_invoices
            self.amount_max = self.template_id.amount_max
            self.invoice_on_timesheets = self.template_id.invoice_on_timesheets
            self.hours_qtt_est = self.template_id.hours_qtt_est
            invoice_line_ids = []
            for x in self.recurring_invoice_line_ids:
                invoice_line_ids.append((0, 0, {
                    'product_id': x.product_id.id,
                    'uom_id': x.uom_id.id,
                    'name': x.name,
                    'quantity': x.quantity,
                    'price_unit': x.price_unit,
                    'analytic_account_id': x.analytic_account_id.id,
                }))
            self.recurring_invoices = self.template_id.recurring_invoices
            self.recurring_interval = self.template_id.recurring_interval
            self.recurring_rule_type = self.template_id.recurring_rule_type
            self.recurring_invoice_line_ids = invoice_line_ids

    @api.onchange('recurring_invoices', 'date_start')
    def onchange_recurring_invoices(self):
        if self.date_start and self.recurring_invoices:
            self.recurring_next_date = self.date_start

    @api.multi
    def cron_account_analytic_account(self):
        remind = {}

        def fill_remind(key, domain, write_pending=False):
            base_domain = [
                ('type', '=', 'contract'),
                ('partner_id', '!=', False),
                ('manager_id', '!=', False),
                ('manager_id.email', '!=', False),
            ]
            base_domain.extend(domain)
            accounts = self.search(base_domain, order='name asc')
            for account in accounts:
                if write_pending:
                    account.write({'state': 'pending'})
                remind_user = remind.setdefault(account.manager_id.id, {})
                remind_type = remind_user.setdefault(key, {})
                remind_partner = remind_type.setdefault(account.partner_id, []).append(account)

        # Already expired
        fill_remind("old", [('state', 'in', ['pending'])])

        # Expires now
        fill_remind("new", [('state', 'in', ['draft', 'open']), '|', '&', ('date', '!=', False), ('date', '<=', fields.Date.context_today(self)), ('is_overdue_quantity', '=', True)], True)

        # Expires in less than 30 days
        fill_remind("future", [('state', 'in', ['draft', 'open']), ('date', '!=', False), ('date', '<', (datetime.datetime.now() + datetime.timedelta(30)).strftime("%Y-%m-%d"))])

        base_url = self.env['ir.config_parameter'].get_param('web.base.url')
        action_id = self.env.ref('account_analytic_analysis.action_account_analytic_overdue_all')[1]
        template_id = self.env.ref('account_analytic_analysis.account_analytic_cron_email_template')[1]
        for user_id, data in remind.items():
            _logger.debug("Sending reminder to uid %s", user_id)
            self.env['mail.template'].with_context(data=data, base_url=base_url, action_id=action_id).send_mail(template_id, user_id, force_send=True)

        return True

    @api.multi
    def hr_to_invoice_timesheets(self):
        domain = [('invoice_id', '=', False), ('to_invoice', '!=', False), ('journal_id.type', '=', 'general'), ('account_id', 'in', self.ids)]
        names = [record.name for record in self]
        name = _('Timesheets to Invoice of %s') % ','.join(names)
        return {
            'type': 'ir.actions.act_window',
            'name': name,
            'view_type': 'form',
            'view_mode': 'tree,form',
            'domain': domain,
            'res_model': 'account.analytic.line',
            'nodestroy': True,
        }

    @api.model
    def _prepare_invoice_data(self, contract):

        Journal = self.env['account.journal']

        if not contract.partner_id:
            raise UserError(_("You must first select a Customer for Contract %s!") % contract.name )

        fpos = contract.partner_id.property_account_position
        Journals = Journal.search([('type', '=', 'sale'),('company_id', '=', contract.company_id.id)], limit=1)
        if not Journals:
            raise UserError(_('Please define a sale journal for the company "%s".') % (contract.company_id.name or '', ))

        partner_payment_term = contract.partner_id.property_payment_term.id

        currency_id = False
        if contract.pricelist_id:
            currency_id = contract.pricelist_id.currency_id.id
        elif contract.partner_id.property_product_pricelist:
            currency_id = contract.partner_id.property_product_pricelist.currency_id.id
        elif contract.company_id:
            currency_id = contract.company_id.currency_id.id

        invoice = {
           'account_id': contract.partner_id.property_account_receivable.id,
           'type': 'out_invoice',
           'partner_id': contract.partner_id.id,
           'currency_id': currency_id,
           'journal_id': Journals.id,
           'date_invoice': contract.recurring_next_date,
           'origin': contract.code,
           'fiscal_position': fpos and fpos.id,
           'payment_term': partner_payment_term,
           'company_id': contract.company_id.id,
        }
        return invoice

    @api.model
    def _prepare_invoice_lines(self, contract, fiscal_position_id):
        AccountFiscalPosition = self.env['account.fiscal.position']
        FiscalPosition = None
        tax_id = []
        if fiscal_position_id:
            FiscalPosition = AccountFiscalPosition.browse(fiscal_position_id)
        invoice_lines = []
        for line in contract.recurring_invoice_line_ids:
            res = line.product_id
            taxes = res.taxes_id
            account_id = res.property_account_income.id
            if not account_id:
                account_id = res.categ_id.property_account_income_categ.id
            if FiscalPosition:
                account_id = FiscalPosition.map_account(account_id)
                tax_id = FiscalPosition.map_tax(taxes)
            invoice_lines.append((0, 0, {
                'name': line.name,
                'account_id': account_id,
                'account_analytic_id': contract.id,
                'price_unit': line.price_unit or 0.0,
                'quantity': line.quantity,
                'uos_id': line.uom_id.id,
                'product_id': line.product_id.id,
                'invoice_line_tax_id': [(6, 0, tax_id and tax_id.ids)],
            }))
        return invoice_lines

    @api.model
    def _prepare_invoice(self, contract):
        invoice = self._prepare_invoice_data(contract)
        invoice['invoice_line'] = self._prepare_invoice_lines(contract, invoice['fiscal_position'])
        return invoice

    @api.multi
    def recurring_create_invoice(self):
        return self._recurring_create_invoice()

    @api.multi
    def _cron_recurring_create_invoice(self):
        return self._recurring_create_invoice(automatic=True)

    @api.multi
    def _recurring_create_invoice(self, automatic=False):
        invoice_ids = []
        current_date =  fields.Date.context_today(self)
        if self.ids:
            contract_ids = self.ids
        else:
            contract_ids = self.search([('recurring_next_date', '<=', current_date), ('state', '=', 'open'), ('recurring_invoices', '=', True), ('type', '=', 'contract')]).ids

        if contract_ids:
            self._cr.execute('SELECT company_id, array_agg(id) as ids FROM account_analytic_account WHERE id IN %s GROUP BY company_id', (tuple(contract_ids),))
            for company_id, ids in self._cr.fetchall():
                for contract in self.with_context(company_id=company_id, force_company=company_id).browse(ids):
                    try:
                        invoice_values = contract._prepare_invoice(contract)
                        invoice_ids.append(self.env['account.invoice'].create(invoice_values))
                        next_date = datetime.datetime.strptime(contract.recurring_next_date or current_date, "%Y-%m-%d")
                        interval = contract.recurring_interval
                        if contract.recurring_rule_type == 'daily':
                            new_date = next_date+relativedelta(days=+interval)
                        elif contract.recurring_rule_type == 'weekly':
                            new_date = next_date+relativedelta(weeks=+interval)
                        elif contract.recurring_rule_type == 'monthly':
                            new_date = next_date+relativedelta(months=+interval)
                        else:
                            new_date = next_date+relativedelta(years=+interval)
                        contract.recurring_next_date = fields.Date.context_today(self)
                        if automatic:
                            contract._cr.commit()
                    except Exception:
                        if automatic:
                            self._cr.rollback()
                            _logger.exception('Fail to create recurring invoice for contract %s', contract.code)
                        else:
                            raise
        return invoice_ids

class AccountAnalyticAccountSummaryUser(models.Model):
    _name = "account_analytic_analysis.summary.user"
    _description = "Hours Summary by User"
    _order = 'user'
    _auto = False
    _rec_name = 'user'

    @api.multi
    def _unit_amount(self):
        res = {}
        AccountAnalyticAccount = self.env['account.analytic.account']
        self._cr.execute('SELECT MAX(id) FROM res_users')
        max_user = self._cr.fetchone()[0]
        account_ids = [int(str(x / max_user - (x % max_user == 0 and 1 or 0))) for x in self.ids]
        user_ids = [int(str(x - ((x / max_user - (x % max_user == 0 and 1 or 0)) * max_user))) for x in self.ids]
        parent_ids = tuple(account_ids) #We don't want consolidation for each of these fields because those complex computation is resource-greedy.
        if parent_ids:
            self._cr.execute('SELECT id, unit_amount ' \
                    'FROM account_analytic_analysis_summary_user ' \
                    'WHERE account_id IN %s ' \
                        'AND "user" IN %s',(parent_ids, tuple(user_ids),))
            for sum_id, unit_amount in self._cr.fetchall():
                res[sum_id] = unit_amount
        for id in self.ids:
            res[id] = round(res.get(id, 0.0), 2)
        return res


    account_id = fields.Many2one('account.analytic.account', string='Analytic Account', readonly=True)
    unit_amount = fields.Float(string='Total Time')
    user = fields.Many2one('res.users', string='User')


    _depends = {
        'res.users': ['id'],
        'account.analytic.line': ['account_id', 'journal_id', 'unit_amount', 'user_id'],
        'account.analytic.journal': ['type'],
    }

    def init(self, cr):
        openerp.tools.sql.drop_view_if_exists(cr, 'account_analytic_analysis_summary_user')
        cr.execute('''CREATE OR REPLACE VIEW account_analytic_analysis_summary_user AS (
            with mu as
                (select max(id) as max_user from res_users)
            , lu AS
                (SELECT
                 l.account_id AS account_id,
                 coalesce(l.user_id, 0) AS user_id,
                 SUM(l.unit_amount) AS unit_amount
             FROM account_analytic_line AS l,
                 account_analytic_journal AS j
             WHERE (j.type = 'general' ) and (j.id=l.journal_id)
             GROUP BY l.account_id, l.user_id
            )
            select (lu.account_id * mu.max_user) + lu.user_id as id,
                    lu.account_id as account_id,
                    lu.user_id as "user",
                    unit_amount
            from lu, mu)''')

class AccountAnalyticAccountSummaryMonth(models.Model):
    _name = "account_analytic_analysis.summary.month"
    _description = "Hours summary by month"
    _auto = False
    _rec_name = 'month'


    account_id = fields.Many2one('account.analytic.account', string='Analytic Account', readonly=True)
    unit_amount = fields.Float(string='Total Time')
    month = fields.Char(string='Month', readonly=True)

    _depends = {
        'account.analytic.line': ['account_id', 'date', 'journal_id', 'unit_amount'],
        'account.analytic.journal': ['type'],
    }

    def init(self, cr):
        openerp.tools.sql.drop_view_if_exists(cr, 'account_analytic_analysis_summary_month')
        cr.execute('CREATE VIEW account_analytic_analysis_summary_month AS (' \
                'SELECT ' \
                    '(TO_NUMBER(TO_CHAR(d.month, \'YYYYMM\'), \'999999\') + (d.account_id  * 1000000::bigint))::bigint AS id, ' \
                    'd.account_id AS account_id, ' \
                    'TO_CHAR(d.month, \'Mon YYYY\') AS month, ' \
                    'TO_NUMBER(TO_CHAR(d.month, \'YYYYMM\'), \'999999\') AS month_id, ' \
                    'COALESCE(SUM(l.unit_amount), 0.0) AS unit_amount ' \
                'FROM ' \
                    '(SELECT ' \
                        'd2.account_id, ' \
                        'd2.month ' \
                    'FROM ' \
                        '(SELECT ' \
                            'a.id AS account_id, ' \
                            'l.month AS month ' \
                        'FROM ' \
                            '(SELECT ' \
                                'DATE_TRUNC(\'month\', l.date) AS month ' \
                            'FROM account_analytic_line AS l, ' \
                                'account_analytic_journal AS j ' \
                            'WHERE j.type = \'general\' ' \
                            'GROUP BY DATE_TRUNC(\'month\', l.date) ' \
                            ') AS l, ' \
                            'account_analytic_account AS a ' \
                        'GROUP BY l.month, a.id ' \
                        ') AS d2 ' \
                    'GROUP BY d2.account_id, d2.month ' \
                    ') AS d ' \
                'LEFT JOIN ' \
                    '(SELECT ' \
                        'l.account_id AS account_id, ' \
                        'DATE_TRUNC(\'month\', l.date) AS month, ' \
                        'SUM(l.unit_amount) AS unit_amount ' \
                    'FROM account_analytic_line AS l, ' \
                        'account_analytic_journal AS j ' \
                    'WHERE (j.type = \'general\') and (j.id=l.journal_id) ' \
                    'GROUP BY l.account_id, DATE_TRUNC(\'month\', l.date) ' \
                    ') AS l '
                    'ON (' \
                        'd.account_id = l.account_id ' \
                        'AND d.month = l.month' \
                    ') ' \
                'GROUP BY d.month, d.account_id ' \
                ')')
