from odoo import models
from odoo.exceptions import AccessError, UserError


class HrExpensePostWizard(models.TransientModel):
    _inherit = 'hr.expense.post.wizard'

    def action_post_entry(self):
        # Extends hr.expense
        expenses = self.env['hr.expense'].browse(self.env.context['active_ids'])
        if not expenses.has_access('write'):
            raise AccessError(self.env._("You don't have the access rights to modify this expense."))
        if not self.env['account.move'].has_access('create'):
            raise UserError(self.env._("You don't have the rights to create accounting entries."))

        existing_bill_expenses = expenses.filtered('existing_bill_id')
        no_existing_bill_expenses = expenses - existing_bill_expenses
        context = dict(self.env.context)
        context['active_ids'] = no_existing_bill_expenses.ids
        if existing_bill_expenses:
            payment_moves_sudo = existing_bill_expenses._post_entry_for_expenses_with_linked_bill()
            context['additional_move_ids'] = payment_moves_sudo.ids

        return super(HrExpensePostWizard, self.with_context(context)).action_post_entry()
