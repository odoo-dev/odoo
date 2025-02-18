import logging
import re

from odoo import api, fields, models
from odoo.exceptions import ValidationError

_logger = logging.getLogger(__name__)
EXPIRATION_PATTERN = re.compile(r'\d{2}/\d{2}')  # 01/12

# https://docs.stripe.com/api/issuing/cards
class HrExpenseStripeCreditCard(models.Model):
    _name = 'hr.expense.stripe.credit.card'
    _inherit = ['mail.thread']
    _description = 'Employee Credit Card'
    _check_company_auto = True
    _rec_name = 'last_4'

    stripe_card_id = fields.Char(string="Stripe Card ID")
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

    # Post Creation Data
    last_4 = fields.Char(string='Last 4 digits', copy=False)
    card_name = fields.Char(string="Card Name", help="The name displayed on the card")
    expiration = fields.Char(string='Expiration Date', readonly=True, size=5, copy=False)

    # Spending Policy
    spending_policy_category_ids = fields.Many2many(comodel_name='product.product', domain=[('can_be_expensed', '=', True)])  # TODO JUAL REMOVE
    spending_policy_limit_ids = fields.One2many(
        string='Spending Policy Limits',
        comodel_name='hr.expense.stripe.spending.limit',
        inverse_name='card_id',
    )
    expense_ids = fields.One2many(comodel_name='hr.expense', inverse_name='card_id', string='Transactions')

    # Stripe object additional fields
    replaced_by = fields.Many2one(comodel_name='hr.expense.stripe.credit.card', string='Replaced By', readonly=True, copy=False)
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

    @api.model_create_multi
    def _create(self, data_list):
        return super()._create(data_list)

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
