# -*- coding: utf-8 -*-

from odoo import api, exceptions, fields, models, _
from odoo.exceptions import UserError, ValidationError
from odoo.tools import date_utils

from dateutil.relativedelta import relativedelta
from datetime import timedelta


class AccountPaymentTerm(models.Model):
    _name = "account.payment.term"
    _description = "Payment Terms"
    _order = "sequence, id"

    def _default_line_ids(self):
        return [(0, 0, {'value': 'balance', 'value_amount': 0.0, 'sequence': 9, 'days': 0, 'option': 'day_after_invoice_date'})]

    def get_early_payment_discount_account(self, move_id):
        self.ensure_one()
        if move_id.move_type == 'in_invoice' or move_id.move_type == 'in_receipt':
            return self.env.company.account_journal_cash_discount_income_id
        return self.env.company.account_journal_cash_discount_expense_id

    name = fields.Char(string='Payment Terms', translate=True, required=True)
    active = fields.Boolean(default=True, help="If the active field is set to False, it will allow you to hide the payment terms without removing it.")
    note = fields.Html(string='Description on the Invoice', translate=True)
    line_ids = fields.One2many('account.payment.term.line', 'payment_id', string='Terms', copy=True, default=_default_line_ids)
    company_id = fields.Many2one('res.company', string='Company')
    sequence = fields.Integer(required=True, default=10)

    # -------Early payment discount fields-------
    early_payment_applicable = fields.Boolean(string="True if the conditions required to offer an EPD are fulfilled.", compute="_compute_early_payment_applicable")
    has_early_payment = fields.Boolean(string="Apply Early Payment Discount", compute="_compute_has_early_payment", readonly=False, store=True)
    percentage_to_discount = fields.Float("Discount", digits='Discount', default=2)
    discount_computation = fields.Selection([
        ('included', 'Tax included'),
        ('excluded', 'Tax excluded'),
       ], string='Computation', default='included')
    discount_days = fields.Integer(string='Availability', required=True, default=7)
    discount_time_availability = fields.Selection(
        string='Discount Availability',
        selection=[
            ('days_after_invoice_date', "days after the invoice date"),
            ('days_after_invoice_month', "days after the end of the invoice month"),
            ('day_following_month', "of the following month"),
            ('day_current_month', "of the current month"),
        ], default='days_after_invoice_date',
        required=True,
    )
    discount_account_id = fields.Many2one(comodel_name='account.account', string='Counterpart Account')

    @api.constrains('line_ids')
    def _check_lines(self):
        for terms in self:
            payment_term_lines = terms.line_ids.sorted()
            if payment_term_lines and payment_term_lines[-1].value != 'balance':
                raise ValidationError(_('The last line of a Payment Term should have the Balance type.'))
            lines = terms.line_ids.filtered(lambda r: r.value == 'balance')
            if len(lines) > 1:
                raise ValidationError(_('A Payment Term should have only one line of type Balance.'))

    def compute(self, company_value, foreign_value, date_ref, currency):
        """Get the distribution of this payment term.

        :param company_value (float): the amount to pay in the company's currency
        :param foreign_value (float): the amount to pay in the document's currency
        :param date_ref (datetime.date): the reference date
        :param currency (Model<res.currency>): the document's currency
        :return (list<tuple<datetime.date,tuple<float,float>>>): the amount in the company's currency and
            the document's currency, respectively for each required payment date
        """
        self.ensure_one()
        date_ref = date_ref or fields.Date.context_today(self)
        company_amount = company_value
        foreign_amount = foreign_value
        sign = company_value < 0 and -1 or 1
        result = []
        company_currency = self.env.company.currency_id
        for line in self.line_ids:
            if line.value == 'fixed':
                company_amt = sign * company_currency.round(line.value_amount)
                foreign_amt = sign * currency.round(line.value_amount)
            elif line.value == 'percent':
                company_amt = company_currency.round(company_value * (line.value_amount / 100.0))
                foreign_amt = currency.round(foreign_value * (line.value_amount / 100.0))
            elif line.value == 'balance':
                company_amt = company_currency.round(company_amount)
                foreign_amt = currency.round(foreign_amount)
            next_date = fields.Date.from_string(date_ref)
            if line.option == 'day_after_invoice_date':
                next_date += relativedelta(days=line.days)
                if line.day_of_the_month > 0:
                    months_delta = (line.day_of_the_month < next_date.day) and 1 or 0
                    next_date += relativedelta(day=line.day_of_the_month, months=months_delta)
            elif line.option == 'after_invoice_month':
                next_first_date = next_date + relativedelta(day=1, months=1)  # Getting 1st of next month
                next_date = next_first_date + relativedelta(days=line.days - 1)
            elif line.option == 'day_following_month':
                next_date += relativedelta(day=line.days, months=1)
            elif line.option == 'day_current_month':
                next_date += relativedelta(day=line.days, months=0)
            result.append((fields.Date.to_date(next_date), (company_amt, foreign_amt)))
            company_amount -= company_amt
            foreign_amt -= foreign_amount
        company_amount = sum(company_amt for _, (company_amt, _) in result)
        company_dist = company_currency.round(company_value - company_amount)
        foreign_amount = sum(foreign_amt for _, (_, foreign_amt) in result)
        foreign_dist = currency.round(foreign_value - foreign_amount)
        if company_dist or foreign_dist:
            last_date = result and result[-1][0] or fields.Date.context_today(self)
            result.append((last_date, (company_dist, foreign_dist)))
        return result

    @api.ondelete(at_uninstall=False)
    def _unlink_except_referenced_terms(self):
        if self.env['account.move'].search([('invoice_payment_term_id', 'in', self.ids)]):
            raise UserError(_('You can not delete payment terms as other records still reference it. However, you can archive it.'))

    def unlink(self):
        for terms in self:
            self.env['ir.property'].sudo().search(
                [('value_reference', 'in', ['account.payment.term,%s'%payment_term.id for payment_term in terms])]
            ).unlink()
        return super(AccountPaymentTerm, self).unlink()

    @api.depends('line_ids')
    def _compute_early_payment_applicable(self):
        for term in self:
            term.early_payment_applicable = not any(line.value != 'balance' for line in term.line_ids)

    @api.depends('early_payment_applicable')
    def _compute_has_early_payment(self):
        for term in self:
            if not term.early_payment_applicable:
                term.has_early_payment = False

    @api.onchange('discount_days')
    def _onchange_discount_days(self):
        if self.discount_days <= 0:
            raise ValidationError(_("The discount availability must be strictly positive."))
        if self.discount_time_availability == "day_following_month" or self.discount_time_availability == "day_current_month":
            if self.discount_days > 31:
                raise ValidationError(_("This date is not valid."))

    @api.onchange('discount_time_availability')
    def _onchange_discount_time_availability(self):
        if self.discount_time_availability == "day_following_month" or self.discount_time_availability == "day_current_month":
            if self.discount_days > 31:
                raise ValidationError(_("This date is not valid."))

    @api.onchange('percentage_to_discount')
    def _onchange_percentage_to_discount(self):
        if self.percentage_to_discount <= 0:
            raise ValidationError(_("The discount percentage must be strictly positive."))
        if self.percentage_to_discount > 100:
            raise ValidationError(_("The discount percentage cannot exceed 100."))

    def _get_last_date_for_discount(self, move_date):
        if self.discount_time_availability == 'days_after_invoice_date':
            return move_date + timedelta(days=self.discount_days)
        if self.discount_time_availability == 'days_after_invoice_month':
            return date_utils.end_of(move_date, 'month') + timedelta(self.discount_days)
        if self.discount_time_availability == 'day_following_month':
            computed_date = date_utils.end_of(move_date, 'month') + timedelta(self.discount_days)
            # Check that the number of days in the timedelta arent > to the number of days in the month
            # (ex: February 31st). If it happens, return the last day of the next month
            last_day_of_month = date_utils.get_month(computed_date)[1]
            if last_day_of_month < computed_date:
                return last_day_of_month
            return computed_date
        if self.discount_time_availability == 'day_current_month':
            computed_date = date_utils.start_of(fields.Date.context_today(self), 'month') + timedelta(self.discount_days)
            # Check that the computed date isn't in the past. If so, go to next month.
            if computed_date < fields.Date.context_today(self):
                computed_date = computed_date.replace(month=computed_date.month + 1)
            # Check that the number of days in the time delta aren't > to the number of days in the month
            last_day_of_month = date_utils.get_month(computed_date)[1]
            if last_day_of_month < computed_date:
                return last_day_of_month
            return computed_date


class AccountPaymentTermLine(models.Model):
    _name = "account.payment.term.line"
    _description = "Payment Terms Line"
    _order = "sequence, id"

    value = fields.Selection([
            ('balance', 'Balance'),
            ('percent', 'Percent'),
            ('fixed', 'Fixed Amount')
        ], string='Type', required=True, default='balance',
        help="Select here the kind of valuation related to this payment terms line.")
    value_amount = fields.Float(string='Value', digits='Payment Terms', help="For percent enter a ratio between 0-100.")
    days = fields.Integer(string='Number of Days', required=True, default=0)
    day_of_the_month = fields.Integer(string='Day of the month', help="Day of the month on which the invoice must come to its term. If zero or negative, this value will be ignored, and no specific day will be set. If greater than the last day of a month, this number will instead select the last day of this month.")
    option = fields.Selection([
            ('day_after_invoice_date', "days after the invoice date"),
            ('after_invoice_month', "days after the end of the invoice month"),
            ('day_following_month', "of the following month"),
            ('day_current_month', "of the current month"),
        ],
        default='day_after_invoice_date', required=True, string='Options'
        )
    payment_id = fields.Many2one('account.payment.term', string='Payment Terms', required=True, index=True, ondelete='cascade')
    sequence = fields.Integer(default=10, help="Gives the sequence order when displaying a list of payment terms lines.")

    @api.constrains('value', 'value_amount')
    def _check_percent(self):
        for term_line in self:
            if term_line.value == 'percent' and (term_line.value_amount < 0.0 or term_line.value_amount > 100.0):
                raise ValidationError(_('Percentages on the Payment Terms lines must be between 0 and 100.'))

    @api.constrains('days')
    def _check_days(self):
        for term_line in self:
            if term_line.option in ('day_following_month', 'day_current_month') and term_line.days <= 0:
                raise ValidationError(_("The day of the month used for this term must be strictly positive."))
            elif term_line.days < 0:
                raise ValidationError(_("The number of days used for a payment term cannot be negative."))

    @api.onchange('option')
    def _onchange_option(self):
        if self.option in ('day_current_month', 'day_following_month'):
            self.days = 0
