from odoo import fields, models
from odoo.addons.hr_expense_stripe.utils import make_request_stripe_proxy

class HrEmployee(models.Model):
    _name = 'hr.employee'
    _inherit = ['hr.employee']

    stripe_cardholder_id = fields.Char(string='Stripe ID', readonly=True, copy=False, index='trigram', groups="hr.group_hr_user")
    can_use_stripe_cards = fields.Boolean(string="Can use stripe credit cards", copy=False, index='btree_not_null', groups="hr.group_hr_user")
    stripe_credit_card_ids = fields.One2many(comodel_name='hr.expense.stripe.credit.card', inverse_name='employee_id', groups="hr.group_hr_user")

    _can_use_stripe_cards = models.Constraint(
        definition='CHECK(can_use_stripe_cards != TRUE OR (can_use_stripe_cards = TRUE AND user_id IS NOT NULL))',
        message="Only employee linked to a user can use stripe credit cards",
    )

    def unlink(self):
        unlink_result = super().unlink()
        for record in self:
            if record.stripe_cardholder_id:
                make_request_stripe_proxy(f'/api/stripe_issuing/1/cardholders/{record.stripe_cardholder_id}', { 'account': record.company_id.stripe_account_id }, method='DELETE')
        return unlink_result
