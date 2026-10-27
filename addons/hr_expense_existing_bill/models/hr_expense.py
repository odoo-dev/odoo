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
        index='btree_not_null',
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

    @api.depends('account_move_id.origin_payment_id.state')
    def _compute_state(self):
        # Extends hr_expense
        expenses_with_existing_bill = self.filtered('existing_bill_id')
        for expense in expenses_with_existing_bill:
            move = expense.account_move_id
            if move.state == 'cancel':
                expense.state = 'paid'
                continue
            if move:
                if expense.payment_mode == 'company_account':
                    # Shortcut to paid, as it's already paid, but we may not have the bank statement yet
                    expense.state = 'paid'
                elif move.state == 'draft':
                    expense.state = 'posted'
                else:  # there's an existing_bill_id
                    expense.state = 'paid' if move.origin_payment_id.state == 'paid' else self.env['account.move']._get_invoice_in_payment_state()
                continue
            expense.state = expense.approval_state or 'draft'

        super(HrExpense, self - expenses_with_existing_bill)._compute_state()

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

    def _post_entry_for_expenses_with_linked_bill(self):
        """
        Create and post different entries to:
        - mark the existing bill as paid
        - transfer the debt from the vendor to the employee
        - prepare the payment to the employee
        """
        payment_moves_sudo = []
        for expense in self:
            payment_move_vals, payment_vals, debt_transfer_move_vals = expense._prepare_linked_bill_paid_by_employee_payment_vals()
            payment_move_sudo, debt_transfer_move_sudo = self.env['account.move'].sudo().create([payment_move_vals, debt_transfer_move_vals])
            payment_vals['move_id'] = payment_move_sudo.id
            payment_sudo = self.env['account.payment'].sudo().create(payment_vals)
            payment_move_sudo.update({
                'origin_payment_id': payment_sudo.id,
                'journal_id': payment_move_sudo.journal_id.id,
            })
            debt_transfer_move_sudo.action_post()
            # post through payment to post both payment and payment move
            payment_sudo.action_post()
            payment_moves_sudo.append(payment_move_sudo)

            # reconcile payment move with debt transfer entry move
            payment_move_payable_lines = payment_move_sudo.line_ids.filtered(lambda l: l.account_type == 'liability_payable')
            transfer_move_payable_lines = debt_transfer_move_sudo.line_ids.filtered(
                lambda l: l.account_type == 'liability_payable' and l.partner_id == expense.employee_id.user_id.partner_id
            )
            if payment_move_payable_lines and transfer_move_payable_lines:
                (payment_move_payable_lines + transfer_move_payable_lines).reconcile()

            # reconcile debt transfer entry with existing bill
            transfer_move_payable_lines = debt_transfer_move_sudo.line_ids.filtered(
                lambda l: l.account_type == 'liability_payable' and l.partner_id == expense.vendor_id
            )
            existing_bill_payable_lines = expense.existing_bill_id.line_ids.filtered(lambda l: l.account_type == 'liability_payable')
            if transfer_move_payable_lines and existing_bill_payable_lines:
                (transfer_move_payable_lines + existing_bill_payable_lines).reconcile()

        return self.env['account.move'].union(*payment_moves_sudo)

    def _prepare_linked_bill_paid_by_employee_payment_vals(self):
        """
        Prepare the values of the different entries and payment needed for an expense paid by employee
        - 1 move for the payment -> PNBK (expense employee payment)
        - 1 payment (to set the origin_payment_id later)
        - 1 move for the debt transfer -> MISC (Debt transfer entry)
        """
        self.ensure_one()
        employee_partner = self.employee_id.user_id.partner_id

        # DEBT TRANSFER ENTRY LINES
        move_lines = [
            # Debit: The payable account (neutralizing the debt of the original bill)
            {
                'name': self._get_move_line_name(),
                'account_id': self.account_id.id,
                'expense_id': self.id,
                'amount_currency': self.total_amount_currency,
                'balance': self.total_amount,
                'currency_id': self.currency_id.id,
                'partner_id': self.vendor_id.id,
            },
            # Credit: The payable account (transferring debt to employee entry)
            {
                'name': self._get_move_line_name(),
                'account_id': self.account_id.id,
                'expense_id': self.id,
                'amount_currency': -self.total_amount_currency,
                'balance': -self.total_amount,
                'currency_id': self.currency_id.id,
                'partner_id': employee_partner.id,
            },
        ]

        # DEBT TRANSFER ENTRY
        debt_transfer_move_vals = {
            'date': self.date or fields.Date.context_today(self),
            'ref': self.name,
            'move_type': 'entry',
            'currency_id': self.currency_id.id,
            'company_id': self.company_id.id,
            'line_ids': [Command.create(line) for line in move_lines],
        }

        # PAYMENT
        payment_vals = {
            'date': self.date,
            'memo': self.name,
            'amount': self.total_amount_currency,
            'payment_type': 'outbound',
            'partner_type': 'supplier',
            'partner_id': employee_partner.id,
            'currency_id': self.currency_id.id,
            'payment_method_line_id': self.payment_method_line_id.id,
            'company_id': self.company_id.id,
        }

        # PAYMENT MOVE LINES
        payment_move_lines = [
            # Debit: the payable account
            {
                'name': self._get_move_line_name(),
                'account_id': self.account_id.id,
                'expense_id': self.id,
                'amount_currency': self.total_amount_currency,
                'balance': self.total_amount,
                'currency_id': self.currency_id.id,
                'partner_id': employee_partner.id,
            },
            # Credit: the outstanding payment account, to pay the employee
            {
                'name': self._get_move_line_name(),
                'account_id': self._get_outstanding_account_id().id,
                'amount_currency': -self.total_amount_currency,
                'balance': -self.total_amount,
                'currency_id': self.currency_id.id,
                'partner_id': employee_partner.id,
            },
        ]

        # PAYMENT MOVE
        payment_move_vals = {
            **self._prepare_move_vals(),
            'date': self.date or fields.Date.context_today(self),
            'ref': self.name,
            'move_type': 'entry',
            'partner_id': employee_partner.id,
            'journal_id': self.env['account.journal'].search(
                [('type', '=', 'bank'), ('company_id', '=', self.env.company.id)], limit=1).id,
            'commercial_partner_id': employee_partner.id,
            'currency_id': self.currency_id.id,
            'company_id': self.company_id.id,
            'line_ids': [Command.create(line) for line in payment_move_lines],
            'partner_bank_id': self.employee_id.sudo().primary_bank_account_id.id,
            'attachment_ids': False,
        }

        return payment_move_vals, payment_vals, debt_transfer_move_vals
