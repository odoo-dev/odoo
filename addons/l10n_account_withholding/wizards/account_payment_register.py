# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import Command, _, api, fields, models
from odoo.exceptions import UserError


class AccountPaymentRegister(models.TransientModel):
    _inherit = 'account.payment.register'

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
        string="Withholding Lines",
        comodel_name='account.payment.register.withholding.line',
        inverse_name='payment_register_id',
        compute='_compute_withholding_line_ids',
        store=True,
        readonly=False,
    )
    withholding_net_amount = fields.Monetary(
        string='Net Amount',
        help="Net amount after deducting the withholding lines",
        compute='_compute_withholding_net_amount',
        store=True,
    )
    # We need to define the outstanding account of the payment in order for it to have the proper journal entry.
    # To that end, we'll have this field required if we have a withholding tax impacting the payment, and we don't have a payment account set on the payment method.
    withholding_default_account_id = fields.Many2one(
        related='journal_id.default_account_id'
    )
    withholding_outstanding_account_id = fields.Many2one(
        comodel_name='account.account',
        string="Outstanding Account",
        copy=False,
        domain="['|', ('account_type', 'in', ('asset_current', 'liability_current')), ('id', '=', withholding_default_account_id)]",
        check_company=True,
        compute="_compute_withholding_outstanding_account_id",
        store=True,
        readonly=False,
    )
    withholding_payment_account_id = fields.Many2one(related="payment_method_line_id.payment_account_id")
    withholding_hide_tax_base_account = fields.Boolean(compute='_compute_withholding_hide_tax_base_account')

    # --------------------------------
    # Compute, inverse, search methods
    # --------------------------------

    @api.depends('withholding_line_ids.amount', 'amount')
    def _compute_withholding_net_amount(self):
        for wizard in self:
            if wizard.can_edit_wizard:
                wizard.withholding_net_amount = wizard.amount - sum(wizard.withholding_line_ids.mapped('amount'))
            else:
                wizard.withholding_net_amount = 0.0

    @api.depends('withholding_payment_account_id')
    def _compute_withholding_outstanding_account_id(self):
        """ We propose a default account by getting one from the latest payment which:
            - Has the same payment method line id (and thus indirectly the same journal, and thus the same company)
            - That payment method has no payment_account_id
            - Yet the payment has an outstanding_account_id
         """
        for wizard in self:
            latest_payment = self.env['account.payment'].search_read(
                domain=[
                    ('payment_method_line_id', '=', wizard.payment_method_line_id.id),
                    ('payment_method_line_id.payment_account_id', '=', False),
                    ('outstanding_account_id', '!=', False),
                ],
                fields=['outstanding_account_id'],
                limit=1,
                order='id desc',
            )
            if wizard.withholding_payment_account_id or not latest_payment:
                wizard.withholding_outstanding_account_id = False  # we'll use the payment method one.
            else:
                wizard.withholding_outstanding_account_id = latest_payment[0]['outstanding_account_id'][0]

    @api.depends('company_id', 'can_edit_wizard', 'can_group_payments', 'group_payment')
    def _compute_display_withholding(self):
        """ We want to hide the withholding tax checkbox in three cases:
         - If there are now withholding taxes in the company;
         - If we are registering payments from multiple entries, where we would end up generating multiple payments;
        """
        available_withholding_taxes = self.env['account.tax'].search([('is_withholding_tax_on_payment', '=', True)])
        for wizard in self:
            if not wizard.company_id:
                wizard.display_withholding = False
                continue

            wizard_domain = self.env['account.withholding.line']._get_withholding_tax_domain(company=wizard.company_id, payment_type=wizard.payment_type)
            wizard_withholding_taxes = available_withholding_taxes.filtered_domain(wizard_domain)

            will_create_multiple_entry = not wizard.can_edit_wizard or (wizard.can_group_payments and not wizard.group_payment)
            wizard.display_withholding = bool(wizard_withholding_taxes) and not will_create_multiple_entry

    @api.depends(
        'can_edit_wizard',
        'should_withhold_tax',
        'currency_id',
        'withholding_line_ids.placeholder_type',
        'withholding_line_ids.previous_placeholder_type',
    )
    def _compute_withholding_line_ids(self):
        for wizard in self:
            # Disable the withholding lines.
            if not wizard.should_withhold_tax or not wizard.can_edit_wizard:
                wizard.withholding_line_ids = [Command.clear()]
                continue

            # Recompute the placeholders only.
            if wizard.withholding_line_ids._need_update_withholding_lines_placeholder():
                wizard.withholding_line_ids = wizard.withholding_line_ids._prepare_update_withholding_lines_placeholder_commands()
                continue

            # Recompute the lines themselves.
            batch = wizard.batches[0]
            base_lines = []
            for move in batch['lines'].move_id:
                move_base_lines, _move_tax_lines = move._get_rounded_base_and_tax_lines()
                base_lines += move_base_lines

            wizard.withholding_line_ids = wizard.withholding_line_ids._prepare_withholding_lines_commands(
                base_lines=base_lines,
                company=wizard.company_id or self.env.company,
            )
            if wizard.withholding_line_ids._need_update_withholding_lines_placeholder():
                wizard.withholding_line_ids = wizard.withholding_line_ids._prepare_update_withholding_lines_placeholder_commands()

    @api.depends('withholding_line_ids')
    def _compute_should_withhold_tax(self):
        """ By default, we display the table only if we have default withholding taxes on any products. """
        for wizard in self:
            wizard.should_withhold_tax = bool(wizard.withholding_line_ids)

    @api.depends('company_id')
    def _compute_withholding_hide_tax_base_account(self):
        for wizard in self:
            wizard.withholding_hide_tax_base_account = bool(wizard.company_id.withholding_tax_base_account_id)

    # ----------------
    # Business methods
    # ----------------

    def _create_payment_vals_from_wizard(self, batch_result):
        # EXTEND 'account'
        payment_vals = super()._create_payment_vals_from_wizard(batch_result)

        # Prepare the withholding lines.
        withholding_account = self.withholding_outstanding_account_id
        if withholding_account:
            payment_vals['outstanding_account_id'] = withholding_account.id
            if not withholding_account.reconcile and withholding_account.account_type not in ('asset_cash', 'liability_credit_card', 'off_balance'):
                withholding_account.reconcile = True
        payment_vals['should_withhold_tax'] = self.should_withhold_tax
        payment_vals['withholding_line_ids'] = []
        for withholding_line_values in self.withholding_line_ids.with_context(active_test=False).copy_data():
            del withholding_line_values['payment_register_id']
            del withholding_line_values['placeholder_value']  # This as well
            payment_vals['withholding_line_ids'].append(Command.create(withholding_line_values))
        return payment_vals
