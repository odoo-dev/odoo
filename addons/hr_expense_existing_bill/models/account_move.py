from odoo import api, fields, models


class AccountMove(models.Model):
    _inherit = 'account.move'

    existing_expense_ids = fields.One2many(comodel_name='hr.expense', inverse_name='existing_bill_id')
    bill_paid_by_employee = fields.Boolean(compute='_compute_bill_paid_by_employee')

    @api.depends('existing_expense_ids')
    def _compute_bill_paid_by_employee(self):
        for move in self:
            move.bill_paid_by_employee = move.existing_expense_ids and any(mode != 'company_account' for mode in set(move.existing_expense_ids.mapped('payment_mode')))
