import logging
import re

from odoo import _, api, fields, models

from odoo.exceptions import ValidationError

_logger = logging.getLogger(__name__)

SPENDING_POLICY_TRANSACTION_PERIODS = [
    ('day', "Day"),
    ('week', "Week"),
    ('month', "Month"),
    ('year', "Year"),
    ('forever', "All Time"),
]
EXPIRATION_PATTERN = re.compile(r'\d{2}/\d{2}')  # 01/12

# https://docs.stripe.com/api/issuing/cards
class HrExpenseStripeCreditCard(models.Model):
    _name = 'hr.expense.stripe.credit.card'
    _inherit = ['mail.thread', 'stripe.issuing']
    _description = 'Employee Credit Card'
    _check_company_auto = True
    _rec_name = 'card_number_public'

    @api.model
    def _default_spending_policy_limit(self):
        return {'transaction_limit': 0, 'transaction_period': 'week'}

    company_id = fields.Many2one(comodel_name='res.company', string='Company', default=lambda self: self.env.company, required=True)
    cardholder_id = fields.Many2one(comodel_name='hr.employee', string="Cardholder", check_company=True, required=True)
    journal_id = fields.Many2one(
        comodel_name='account.journal',
        string='Stripe Journal',
        default=lambda self: self.env.company.stripe_journal_id,
        domain=[('type', '=', 'bank')],
        check_company=True,
        required=True,
    )
    currency_id = fields.Many2one(related='company_id.stripe_currency_id')
    state = fields.Selection(  # Stripe states
        string="Status",
        selection=[
            ('inactive', "Inactive"),
            ('active', "Active"),
            ('canceled', "Canceled"),
        ],
        default='inactive',
        required=True,
        copy=False,
        tracking=True,
    )
    card_type = fields.Selection(  # Stripe types
        string="Type of card",
        selection=[
            ('physical', "Physical"),  # Not implemented yet
            ('virtual', "Virtual"),
        ],
        default='virtual',
    )
    last_4 = fields.Char(string='Last 4 digits', copy=False)
    card_number_public = fields.Char(string='Card Number', compute='_compute_card_number_public', copy=False, size=20)
    cvv_public = fields.Char(string='CVV', default='***', store=False, copy=False, size=3)
    expiration = fields.Char(string='Expiration Date', readonly=True, size=5, copy=False)
    spending_policy_category_ids = fields.Many2many(comodel_name='product.product', domain=[('can_be_expensed', '=', True)])
    spending_policy_limit = fields.Json(string='Spending Policy Limit', default=_default_spending_policy_limit, store=True)
    replaced_by = fields.Many2one(comodel_name='hr.expense.stripe.credit.card', string='Replaced By', readonly=True, copy=False)
    expense_ids = fields.One2many(comodel_name='hr.expense', inverse_name='card_id', string='Transactions')

    # Related fields
    cardholder_phone = fields.Char(related='cardholder_id.mobile_phone', string='Mobile', readonly=False)
    cardholder_first_name = fields.Char(related='cardholder_id.private_first_name', string='Cardholder First Name', readonly=False)
    cardholder_last_name = fields.Char(related='cardholder_id.private_last_name', string='Cardholder Last Name', readonly=False)
    country_code = fields.Char(comodel_name='res.country', related='company_id.country_code')

    # Stripe object additional fields
    cancellation_reason = fields.Selection(
        string="Cancellation Reason",
        selection=[
            ('design_rejected', "Design Rejected"),
            ('lost', "Lost"),
            ('stolen', "Stolen"),
        ],
        readonly=True,
    )

    @api.constrains('expiration')
    def _check_expiration(self):
        for card in self.filtered('expiration'):
            if not re.match(EXPIRATION_PATTERN, card.expiration):
                raise ValidationError(_('Expiration date must be in the format DD/MM'))

    def _compute_card_number_public(self):
        for card in self:
            card.card_number_public = f'**** **** **** {card.last_4 or "****"}'

    @api.model
    def _convert_stripe_data_to_odoo_vals(self, stripe_data):
        # EXTENDS stripe.issuing
        res = super()._convert_stripe_data_to_odoo_vals(stripe_data)
        if not res:
            return {}
        if stripe_data['replaced_by']:
            card_id = self.env['hr.expense.stripe.credit.card'].search([('stripe_id', '=', stripe_data['replaced_by'])], limit=1).id
            if card_id:
                res['replaced_by'] = card_id
        res.update({
            # 'cardholder_id': , # Must be defined outside the function as a search is required
            'state': stripe_data['status'],
            'currency_id': self.env['res.currency'].search([('name', '=', stripe_data['currency'].upper())], limit=1).id,
            'expiration': f'{stripe_data["exp_month"]:0>2}/{str(stripe_data["exp_year"])[2:]}',
            'last_4': stripe_data['last4'],
            'card_type': stripe_data['type'],
            # TODO JUAL Add spending control
        })
        return res

    def _create_from_stripe(self, vals):
        # OVERRIDDE stripe.issuing
        create_vals = []
        for record_data in vals:
            if record_data['livemode'] != (self._get_stripe_mode() == 'live'):
                raise ValidationError(_(
                    "The stripe data received is not in the same mode as the company. Are you sending test data to a live company?"
                ))
            cardholder_data = record_data['cardholder']
            cardholder = self.env['hr.employee'].search(
                [
                    '|', ('stripe_id', '=', cardholder_data['id']),
                         '&', ('stripe_id', '=', False),
                              '|', ('email', '=', cardholder_data['email']), ('work_email', '=', cardholder_data['email']),
                ], limit=1
            )
            if not cardholder:
                cardholder = self.env['hr.employee']._create_from_stripe([{cardholder_data['id']: cardholder_data}])
            if cardholder:  # Not created if invalid
                create_data = self._convert_stripe_data_to_odoo_vals(record_data)
                create_data['cardholder_id'] = cardholder.id
                if create_data:  # Skip impossible imports
                    create_vals.append(create_data)
        new_records = self.create(create_vals)
        return new_records

    def _update_from_stripe(self, vals):
        # OVERRIDE stripe.issuing
        for record in self:
            record_data_raw = vals.get(record.stripe_id, {})
            if not record_data_raw:
                raise ValidationError(_("The stripe data received is invalid"))

            if record_data_raw['livemode'] != (self._get_stripe_mode() == 'live'):
                raise ValidationError(_(
                    "The stripe data received is not in the same mode as the company. Are you sending test data to a live company?"
                ))
            record_data = self._convert_stripe_data_to_odoo_vals(record_data_raw)
            cardholder = self.env['hr.employee'].search(
                [
                    ('company_id', '=', self.env.company.id),
                    '|', ('stripe_id', '=', record_data_raw['cardholder']['id']),
                         '&',('stripe_id', '=', False), ('work_email', '=', record_data_raw['cardholder']['email']),
                ], limit=1
            )
            if not cardholder:
                raise ValidationError(_("The stripe data received is invalid, cannot find the cardholder in the employees"))
            if not cardholder.stripe_id:
                cardholder.can_use_stripe_cards = True
                cardholder.stripe_id = record_data_raw['cardholder']['id']
            record_data['cardholder_id'] = cardholder.id
            record.write(record_data)

    @api.constrains('company_id')
    def _check_company_id(self):
        for card in self:
            if not card.requires_stripe_sync:
                raise ValidationError(_("The Stripe issuing account isn't properly set, please connect you to Stripe in the config"))

    def _can_pay_amount(self, amount, merchant_data):
        self.ensure_one()
        if (
            self.cardholder_id.active
            and self.state == 'active'
        #     TODO JUAL ADD SPENDING LIMIT
        ):
            return True

        return False
