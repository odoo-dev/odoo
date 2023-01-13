# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, _


class AccountPayment(models.Model):
    _inherit = "account.payment"

    def action_open_expense_report(self):
        self.ensure_one()
        return {
            'name': self.expense_sheet_id.name,
            'type': 'ir.actions.act_window',
            'view_type': 'form',
            'view_mode': 'form',
            'views': [(False, 'form')],
            'res_model': 'hr.expense.sheet',
            'res_id': self.expense_sheet_id.id
        }

    def _synchronize_from_moves(self, changed_fields):
        if self.expense_sheet_id:
            # Constraints bypass when entry is linked to an expense.
            # Context is not enough, as we want to be able to delete
            # and update those entries later on.
            return
        return super()._synchronize_from_moves(changed_fields)

    def _creation_message(self):
        self.ensure_one()
        if self.move_id.expense_sheet_id:
            return _("Payment created for: %s", self.move_id.expense_sheet_id._get_html_link())
        return super()._creation_message()
