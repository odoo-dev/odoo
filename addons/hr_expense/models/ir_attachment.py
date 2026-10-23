from collections.abc import Collection

from odoo import api, models
from odoo.exceptions import AccessError


class IrAttachment(models.Model):
    _inherit = 'ir.attachment'

    @api.ondelete(at_uninstall=False)
    def _prevent_delete_from_submitted_expense(self):
        expense_attachments = self.filtered(lambda a: a.res_model == 'hr.expense' and a.res_id)
        expenses = self.env['hr.expense'].browse(expense_attachments.mapped('res_id'))
        if not all(
            (expense.exists() and expense.state in {'draft', 'submitted'} and expense.has_access('write')) or self.env.su
            for expense in expenses
        ):
            raise AccessError(self.env._("You can't delete attachments from an expense once it has been submitted."))

    def _inaccessible_comodel_records(self, model_and_ids: dict[str, Collection[int]], operation: str):
        expense_ids = list(filter(None, model_and_ids.get('hr.expense', [])))
        expenses = self.env['hr.expense'].browse(expense_ids)
        # Employees can attach receipts to their own expenses at any time, even once they can't edit them anymore
        accessible_user_expense_ids = set(expenses._filtered_access('read').filtered(
            lambda e: e.employee_id.user_id == self.env.user
        ).ids)
        model_and_ids = {
            **model_and_ids,
            'hr.expense': [id_ for id_ in expense_ids if id_ not in accessible_user_expense_ids],
        }
        yield from super()._inaccessible_comodel_records(model_and_ids, operation)

    def _has_attachments_ownership(self, attachment_tokens):
        expense_attachments = self.filtered(lambda a: a.has_access('read') and a.res_model == 'hr.expense' and a.res_id)
        expenses = self.env['hr.expense'].browse(expense_attachments.mapped('res_id'))
        # Ownership allows mail to delete attachments as superuser, so it must follow _prevent_delete_from_submitted_expense
        if expenses.filtered(lambda e: not (e.state in {'draft', 'submitted'} and e.has_access('write'))) and not self.env.su:
            return False
        return super()._has_attachments_ownership(attachment_tokens)
