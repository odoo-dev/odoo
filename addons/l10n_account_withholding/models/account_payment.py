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
    )
    withholding_original_amount = fields.Float()
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

    @api.onchange('withholding_line_ids')
    def _onchange_withholding_line_amounts(self):
        """ Called in cases when the withholding lines must be updated. """
        self.ensure_one()
        AccountTax = self.env['account.tax']
        base_lines = []

        for line in self.withholding_line_ids:
            base_line = line._prepare_base_line_for_taxes_computation()
            AccountTax._add_tax_details_in_base_line(base_line, self.company_id)
            AccountTax._round_base_lines_tax_details([base_line], self.company_id)
            base_lines.append(base_line)

        self.withholding_line_ids = self.withholding_line_ids._prepare_withholding_lines_commands(
            base_lines=base_lines,
            company=self.company_id or self.env.company,
        )
        self._update_withholding_lines_placeholders()

    @api.onchange('withholding_line_ids')
    def _update_withholding_line_placeholders(self):
        self._update_withholding_lines_placeholders()

    def _update_withholding_lines_placeholders(self):
        """
        Go through each withholding lines in self and refresh their dynamic placeholders.
        We only set it if the tax on the line is using a sequence, and we peek at the next numbers to give an idea of
        what these will look like.
        """
        self.ensure_one()
        grouped_relevant_lines = self.withholding_line_ids.filtered(lambda l: l.withholding_sequence_id and not l.name).grouped('withholding_sequence_id')
        for sequence, lines in grouped_relevant_lines.items():
            for i, line in enumerate(lines):
                line.placeholder_value = sequence.get_next_char(sequence.number_next_actual + i)

    # -----------------------
    # CRUD, inherited methods
    # -----------------------

    @api.model_create_multi
    def create(self, vals_list):
        # EXTEND account to populate the original amount with the amount value at creation.
        for vals in vals_list:
            if 'amount' in vals:
                vals['withholding_original_amount'] = vals['amount']
        return super().create(vals_list)

    @api.model
    def _get_trigger_fields_to_synchronize(self):
        # EXTEND account to add the withholding fields in the list.
        return super()._get_trigger_fields_to_synchronize() + ('withholding_line_ids', 'should_withhold_tax')

    def _synchronize_to_moves(self, changed_fields):
        # EXTEND account to synchronize withholding tax lines.
        if not any(field_name in changed_fields for field_name in self._get_trigger_fields_to_synchronize()):
            return

        # EXTEND account
        # We want to affect the payment in case it has withholding lines, or the withhold tax enabled.
        withholding_payments = self.filtered(lambda p: p.withholding_line_ids or p.withhold_tax)
        for pay in withholding_payments:
            # For withholding payments, we do not want to merge the writeoff lines. Instead, we will recompute them.
            liquidity_lines, counterpart_lines, writeoff_lines = pay._seek_for_lines()
            withholding_line_vals_list = None
            # Support the case of a withholding payment with line where we disable the "withhold tax".
            if pay.should_withhold_tax:
                withholding_line_vals_list = self.withholding_line_ids._prepare_withholding_amls_create_values()
            # We need to make sure to provide the new write off lines in order to correctly compute the counterpart line amount.
            line_vals_list = pay._prepare_move_line_default_vals(write_off_line_vals=withholding_line_vals_list)
            line_ids_commands = [
                Command.update(liquidity_lines.id, line_vals_list[0]) if liquidity_lines else Command.create(line_vals_list[0]),
                Command.update(counterpart_lines.id, line_vals_list[1]) if counterpart_lines else Command.create(line_vals_list[1])
            ]
            line_ids_commands.extend([Command.create(withholding_line_vals) for withholding_line_vals in line_vals_list[2:]])
            # Don't forget to remove the old writeoff lines.
            line_ids_commands.extend([Command.delete(line.id) for line in writeoff_lines])
            pay.move_id \
                .with_context(skip_invoice_sync=True) \
                .write({
                    'partner_id': pay.partner_id.id,
                    'currency_id': pay.currency_id.id,
                    'partner_bank_id': pay.partner_bank_id.id,
                    'line_ids': line_ids_commands,
                })

        # All other payments will use the original logic
        super(AccountPayment, self - withholding_payments)._synchronize_to_moves(changed_fields)

    def _generate_move_vals(self, write_off_line_vals=None, force_balance=None, line_ids=None):
        # EXTEND account to prepare withholding line vals when generating the move.
        self.ensure_one()
        if self.should_withhold_tax and not write_off_line_vals:
            write_off_line_vals = self.withholding_line_ids._prepare_withholding_amls_create_values()
        return super()._generate_move_vals(write_off_line_vals, force_balance, line_ids)
