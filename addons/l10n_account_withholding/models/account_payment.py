# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import Command, api, fields, models


class AccountPayment(models.Model):
    _inherit = 'account.payment'

    # ------------------
    # Fields declaration
    # ------------------

    display_withholding = fields.Boolean(compute='_compute_display_withholding')
    should_withhold_tax = fields.Boolean(
        string='Withhold Tax Amounts',
        compute='_compute_should_withhold_tax',
        readonly=False,
        store=True,
        copy=False,
    )
    withholding_line_ids = fields.One2many(
        string='Withholding Lines',
        comodel_name='account.payment.withholding.line',
        inverse_name='payment_id',
        compute='_compute_withholding_line_ids',
        readonly=False,
        store=True,
    )
    withholding_payment_account_id = fields.Many2one(related="payment_method_line_id.payment_account_id")
    # We may need to manually set an account, for this we want it to not be readonly by default.
    outstanding_account_id = fields.Many2one(readonly=False)
    withholding_hide_tax_base_account = fields.Boolean(compute='_compute_withholding_hide_tax_base_account')

    # --------------------------------
    # Compute, inverse, search methods
    # --------------------------------

    @api.depends('company_id')
    def _compute_display_withholding(self):
        """ We want to hide the withholding tax checkbox in two cases:
         - If there are now withholding taxes in the company;
        """
        available_withholding_taxes = self.env['account.tax'].search([('is_withholding_tax_on_payment', '=', True)])
        for payment in self:
            if not payment.company_id:
                payment.display_withholding = False
                continue

            payment_domain = self.env['account.withholding.line']._get_withholding_tax_domain(company=payment.company_id, payment_type=payment.payment_type)
            payment_withholding_taxes = available_withholding_taxes.filtered_domain(payment_domain)

            payment.display_withholding = bool(payment_withholding_taxes)

    @api.depends('withholding_line_ids')
    def _compute_should_withhold_tax(self):
        """ We enable the boolean by default only if withholding tax lines are given at the creation of the payment. """
        for payment in self:
            payment.should_withhold_tax = bool(payment.withholding_line_ids)

    @api.depends('company_id')
    def _compute_withholding_hide_tax_base_account(self):
        for payment in self:
            payment.withholding_hide_tax_base_account = bool(payment.company_id.withholding_tax_base_account_id)

    # ----------------------------
    # Onchange, Constraint methods
    # ----------------------------

    @api.depends(
        'should_withhold_tax',
        'currency_id',
        'withholding_line_ids.placeholder_type',
        'withholding_line_ids.previous_placeholder_type',
    )
    def _compute_withholding_line_ids(self):
        for payment in self:
            # Disable the withholding lines.
            if not payment.should_withhold_tax:
                payment.withholding_line_ids = [Command.clear()]
                continue

            # Recompute the placeholders only.
            if payment.withholding_line_ids._need_update_withholding_lines_placeholder():
                payment.withholding_line_ids = payment.withholding_line_ids._prepare_update_withholding_lines_placeholder_commands()

    # -----------------------
    # CRUD, inherited methods
    # -----------------------

    @api.model
    def _get_trigger_fields_to_synchronize(self):
        # EXTEND account to add the withholding fields in the list.
        return super()._get_trigger_fields_to_synchronize() + ('withholding_line_ids', 'should_withhold_tax')

    def _synchronize_to_moves(self, changed_fields):
        # EXTEND account
        super()._synchronize_to_moves(changed_fields)
        if not changed_fields.intersection({'withholding_line_ids', 'should_withhold_tax'}):
            return

        for pay in self:
            if (
                not pay.withholding_line_ids
                or not pay.should_withhold_tax
                or set(pay.move_id.line_ids.tax_line_id) == set(pay.withholding_line_ids.tax_id)
            ):
                continue

            liquidity_lines, counterpart_lines, writeoff_lines = pay._seek_for_lines()
            line_ids_commands = []
            liquidity_line_balance = liquidity_lines.balance
            liquidity_line_amount_currency = liquidity_lines.amount_currency
            withholding_line_values_list = pay.withholding_line_ids._prepare_withholding_amls_create_values()
            for line_values in withholding_line_values_list:
                line_ids_commands.append(Command.create(line_values))
                liquidity_line_balance -= line_values['balance']
                liquidity_line_amount_currency -= line_values['amount_currency']
            line_ids_commands.append(Command.update(liquidity_lines.id, {
                'balance': liquidity_line_balance,
                'amount_currency': liquidity_line_amount_currency,
            }))
            pay.move_id.with_context(skip_invoice_sync=True).line_ids = line_ids_commands

    def _generate_move_vals(self, write_off_line_vals=None, force_balance=None, line_ids=None):
        # EXTEND account
        move_vals = super()._generate_move_vals(write_off_line_vals=write_off_line_vals, force_balance=force_balance, line_ids=line_ids)
        if not self.withholding_line_ids or not self.should_withhold_tax:
            return move_vals

        liquidity_line_values = move_vals['line_ids'][0][2]
        liquidity_line_balance = liquidity_line_values['debit'] - liquidity_line_values['credit']
        liquidity_line_amount_currency = liquidity_line_values['amount_currency']
        withholding_line_values_list = self.withholding_line_ids._prepare_withholding_amls_create_values()
        for line_values in withholding_line_values_list:
            move_vals['line_ids'].append(Command.create(line_values))
            liquidity_line_balance -= line_values['balance']
            liquidity_line_amount_currency -= line_values['amount_currency']
        liquidity_line_values['amount_currency'] = liquidity_line_amount_currency
        if liquidity_line_balance > 0.0:
            liquidity_line_values['debit'] = liquidity_line_balance
            liquidity_line_values['credit'] = 0.0
        else:
            liquidity_line_values['debit'] = 0.0
            liquidity_line_values['credit'] = -liquidity_line_balance
        return move_vals