import logging
import re

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError, UserError
from odoo.addons.hr_expense_stripe.utils import make_request_stripe_proxy

_logger = logging.getLogger(__name__)

# https://docs.stripe.com/api/issuing/cards
class HrExpenseStripeCreditCard(models.Model):
    _name = 'hr.expense.stripe.credit.card'
    _inherit = ['mail.thread']
    _description = 'Employee Credit Card'
    _check_company_auto = True
    _rec_name = 'card_number_public'

    stripe_id = fields.Char(string="Stripe Card ID")
    company_id = fields.Many2one(comodel_name='res.company', string='Company', default=lambda self: self.env.company, required=True)
    employee_id = fields.Many2one(comodel_name='hr.employee', string="Cardholder", check_company=True, required=True)
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

    # Post Creation Card Data
    last_4 = fields.Char(string='Last 4 digits', copy=False, readonly=True)
    card_name = fields.Char(string="Card Name", help="The name displayed on the card", copy=False, readonly=True)
    expiration = fields.Char(string='Expiration Date', size=5, copy=False, readonly=True)
    card_number_public = fields.Char(string="Card Number", size=23, compute="_compute_card_number", readonly=True,)

    # Block card flow
    cancellation_reason = fields.Selection(
        string="Cancellation Reason",
        selection=[
            ('design_rejected', "Design Rejected"),
            ('lost', "Lost"),
            ('stolen', "Stolen"),
        ],
        readonly=True,
    )

    # Spending Policy
    spending_policy_category_ids = fields.Many2many(comodel_name='product.product', domain=[('can_be_expensed', '=', True)])  # TODO JUAL REMOVE
    spending_policy_limit_ids = fields.One2many(
        string='Spending Policy Limits',
        comodel_name='hr.expense.stripe.spending.limit',
        inverse_name='card_id',
    )
    expense_ids = fields.One2many(comodel_name='hr.expense', inverse_name='card_id', string='Transactions')

    @api.constrains('company_id')
    def _check_company_id(self):
        for card in self:
            if not card.company_id.stripe_id:
                raise ValidationError(_("The Stripe issuing account isn't properly set, please connect you to Stripe in the config"))

    @api.depends('last_4')
    def _compute_card_number(self):
        for card in self:
            card.card_number_public = f"**** **** **** {card.last_4 or '****'}"

    @api.model_create_multi
    def _create(self, data_list):
        cards = super()._create(data_list)
        for card in cards:
            if not card.employee_id.stripe_id:
                raise UserError(_("You must configure your cardholder before creating a card."))

            if not card.stripe_id:
                card._create_or_update_card()

        return cards

    def _create_or_update_card(self):
        self.ensure_one()

        payload = {
            'account': self.company_id.stripe_id,
            'status': self.state,
        }

        if self.stripe_id:
            route = f'cards/{self.stripe_id}'
        else:
            route = 'cards'

            payload |= {
                'type': self.card_type,
                'currency':self.currency_id.name.lower(),
                'cardholder': self.employee_id.stripe_id,
            }

        response = make_request_stripe_proxy(route, payload, method='POST')
        self._update_from_stripe(response)

    def _update_from_stripe(self, response):
        """
        Updates a card from a Stripe card object See: https://docs.stripe.com/api/issuing/cards/object
        """
        self.ensure_one()
        if self.stripe_id and self.stripe_id != response['id']:
            raise ValidationError(_("Failed to update card from Stripe. You are trying to update the wrong card."))

        self.stripe_id = response['id']

        self.state = response['status']

        self.card_name = response['cardholder']['name']
        self.last_4 = response['last4']
        exp_month = response['exp_month']
        if exp_month < 10:
            exp_month = f'0{exp_month}'
        exp_year = str(response['exp_year'])[2:]
        self.expiration = f'{exp_month}/{exp_year}'

    def _get_replacement_reason(self):
        self.ensure_one()
        if self.state == 'expired':
            return self.state
        else:
            if self.cancellation_reason and self.cancellation_reason != 'design_rejected':
                return self.cancellation_reason
            else:
                return None

    def action_open_cardholder_wizard(self):
        self.ensure_one()

        wizard = self.env['hr.expense.stripe.cardholder.wizard'].create({
            'company_id': self.company_id.id,
            'employee_id': self.env.context.get('selected_employee_id', self.employee_id.id),
        })

        return {
            'type': 'ir.actions.act_window',
            'name': _("Cardholder Configuration"),
            'view_mode': 'form',
            'res_model': wizard._name,
            'target': 'new',
            'context': self.env.context,
            'views': [[False, 'form']],
            'res_id': wizard.id
        }

    def _can_pay_amount(self):
        self.ensure_one()
        return self.employee_id.active
