from odoo import api, fields, models, Command
from odoo.exceptions import UserError


class HrExpense(models.Model):
    _inherit = 'hr.expense'

    has_existing_bill = fields.Boolean(
        help=""" - When a bill already exists, the payment will use the supplier payable account so it can be matched with the bill.
                 - When no bill exists, the payment will be recorded directly on the expense account, as usual.
            """
    )

    existing_bill_id = fields.Many2one(
        string="Existing Bill",
        comodel_name='account.move',
        domain="""[
            ('company_id', '=', company_id),
            ('move_type', '=', 'in_invoice'),
            ('state', 'in', ['posted', 'draft']),
            ('amount_residual', '>', 0),
            '|', ('partner_id', '=', vendor_id), (not vendor_id, '=', True),
        ]""",
        copy=False,
    )

    # Override hr_expense to modify help
    account_id = fields.Many2one(
        help="An expense account is expected for employee paid expenses and company paid expenses without a matched bill.\n"
             "For company paid expenses with a matched bill, the account needs to be the payable account of the bill.",
    )

    @api.onchange('has_existing_bill')
    def _onchange_has_existing_bill(self):
        if not self.has_existing_bill:
            self.existing_bill_id = False

    @api.depends('has_existing_bill', 'existing_bill_id', 'vendor_id')
    def _compute_account_id(self):
        # Extends hr_expense
        expenses_with_existing_bill = self.filtered('has_existing_bill')
        expense_no_existing_bill = [self - expenses_with_existing_bill]
        for _expense in expenses_with_existing_bill:
            expense = _expense.with_company(_expense.company_id)
            if expense.existing_bill_id:
                payable_line = expense.existing_bill_id.line_ids.filtered(lambda l: l.account_type == 'liability_payable')
                expense.account_id = payable_line[:1].account_id
            else:  # there's an existing_bill_id
                # no fallback so it can be wrong, but the user can edit the field
                expense.account_id = expense.vendor_id.commercial_partner_id.property_account_payable_id

            if not expense.account_id:
                expense_no_existing_bill.append(expense)

        super(HrExpense, self.browse().union(*expense_no_existing_bill))._compute_account_id()

    def _create_company_paid_moves(self):
        # Extends hr_expense
        moves = super()._create_company_paid_moves()
        for move in moves:
            expense = move.expense_ids
            if expense.existing_bill_id:
                expense._reconcile_expense_with_bill()

        return moves

    def _reconcile_expense_with_bill(self):
        self.ensure_one()
        if not self.existing_bill_id:
            return

        bill_payable_lines = self.existing_bill_id.line_ids.filtered(lambda l: l.account_id.account_type == 'liability_payable')
        expense_payable_lines = self.account_move_id.line_ids.filtered(lambda l: l.account_id.account_type == 'liability_payable')

        if bill_payable_lines and expense_payable_lines:
            (bill_payable_lines + expense_payable_lines).reconcile()

    def _prepare_payments_vals(self):
        # Extends hr_expense
        self.ensure_one()

        if not self.has_existing_bill:
            return super()._prepare_payments_vals()

        if not self.payment_method_line_id:
            raise UserError(self.env._("You need to add a manual payment method on the journal (%s)", self.journal_id.name))

        return self._prepare_linked_bill_payment_vals()

    def _prepare_linked_bill_payment_vals(self):
        self.ensure_one()

        move_lines = [
            # Debit: The Payable Account (neutralizing the debt of the original bill)
            {
                'name': self._get_move_line_name(),
                'account_id': self.account_id.id,
                'expense_id': self.id,
                'amount_currency': self.total_amount_currency,
                'balance': self.total_amount,
                'currency_id': self.currency_id.id,
                'partner_id': self.vendor_id.id,
            },
            # Credit: Outstanding Payments
            {
                'name': self._get_move_line_name(),
                'account_id': self._get_expense_account_destination(),
                'amount_currency': -self.total_amount_currency,
                'balance': -self.total_amount,
                'currency_id': self.currency_id.id,
                'partner_id': self.vendor_id.id,
            }
        ]

        payment_vals = {
            'date': self.date,
            'memo': self.name,
            'journal_id': self.journal_id.id,
            'amount': self.total_amount_currency,
            'payment_type': 'outbound',
            'partner_type': 'supplier',
            'partner_id': self.vendor_id.id,
            'currency_id': self.currency_id.id,
            'payment_method_line_id': self.payment_method_line_id.id,
            'company_id': self.company_id.id,
        }

        move_vals = {
            **self._prepare_move_vals(),
            'date': self.date or fields.Date.context_today(self),
            'ref': self.name,
            'journal_id': self.journal_id.id,
            'partner_id': self.vendor_id.id,
            'currency_id': self.currency_id.id,
            'company_id': self.company_id.id,
            'line_ids': [Command.create(line) for line in move_lines],
        }

        return move_vals, payment_vals


