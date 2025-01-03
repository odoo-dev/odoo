import logging

from odoo import fields, models

_logger = logging.getLogger(__name__)

class HrExpense(models.Model):
    _inherit = 'hr.expense'

    stripe_authorization_id = fields.Char('Stripe Authorization ID', readonly=True)
    stripe_transaction_id = fields.Char('Stripe Transaction ID', readonly=True)
    card_id = fields.Many2one(
        comodel_name='hr.expense.stripe.credit.card',
        string='Credit Card ID',
        readonly=True,
        groups='hr.group_hr_manager',
    )

    def _compute_is_editable(self):
        card_expenses = self.filtered('card_id')
        for expense in card_expenses:
            expense.is_editable = False
        super(HrExpense, self - card_expenses)._compute_is_editable()

    def _get_default_responsible_for_approval(self):
        # EXTEND hr_expense to bypass approval for expenses created from a stripe transaction
        for expense in self:
            if expense.sudo().card_id:
                return False
        else:
            return super()._get_default_responsible_for_approval()

    def _do_approve(self, check=True):
        # EXTEND hr_expense to bypass approval for expenses created from a stripe transaction
        expenses_from_stripe = self.filtered(lambda exp: exp.sudo().card_id and exp.state in {'submitted', 'draft'})
        for expense in expenses_from_stripe:
            expense.write({
                'approval_state': 'approved',
                'manager_id': False,
                'approval_date': fields.Date.context_today(expense),
            })
        expenses_from_stripe.update_activities_and_mails()
        super(HrExpense, self - expenses_from_stripe)._do_approve(check)
