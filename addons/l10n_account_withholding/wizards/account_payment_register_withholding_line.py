# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, fields, models


class AccountPaymentRegisterWithholdingLine(models.TransientModel):
    _name = 'account.payment.register.withholding.line'
    _inherit = "account.withholding.line"
    _description = 'Payment register withholding line'

    # ------------------
    # Fields declaration
    # ------------------

    payment_register_id = fields.Many2one(
        comodel_name='account.payment.register',
        required=True,
        ondelete='cascade',
    )

    # --------------------------------
    # Compute, inverse, search methods
    # --------------------------------

    def _get_default_base_amount_when_no_source_currency(self):
        self.ensure_one()
        return self.payment_register_id.amount

    @api.depends('payment_register_id.amount')
    def _compute_original_amounts(self):
        # Extended to add the dependency
        super()._compute_original_amounts()

    @api.depends('payment_register_id.payment_type')
    def _compute_type_tax_use(self):
        for line in self:
            line.type_tax_use = 'sale' if line.payment_register_id.payment_type == 'inbound' else 'purchase'

    @api.depends('payment_register_id.amount', 'payment_register_id.can_edit_wizard', 'payment_register_id.should_withhold_tax')
    def _compute_comodel_percentage_paid_factor(self):
        for line in self:
            wizard = line.payment_register_id
            if not wizard.can_edit_wizard:
                line.comodel_percentage_paid_factor = 0.0
                continue

            total_amount_values = wizard._get_total_amounts_to_pay(wizard.batches)
            if total_amount_values['full_amount']:
                line.comodel_percentage_paid_factor = abs(wizard.amount / total_amount_values['full_amount'])
            else:
                line.comodel_percentage_paid_factor = 0.0

    @api.depends('payment_register_id.payment_date')
    def _compute_comodel_date(self):
        for line in self:
            line.comodel_date = line.payment_register_id.payment_date

    @api.depends('payment_register_id.payment_type')
    def _compute_comodel_payment_type(self):
        for line in self:
            line.comodel_payment_type = line.payment_register_id.payment_type

    @api.depends('payment_register_id.company_id')
    def _compute_company_id(self):
        for line in self:
            line.company_id = line.payment_register_id.company_id

    @api.depends('payment_register_id.currency_id')
    def _compute_comodel_currency_id(self):
        for line in self:
            line.comodel_currency_id = line.payment_register_id.currency_id

    # -----------------------
    # CRUD, inherited methods
    # -----------------------

    def _prepare_withholding_amls_create_values(self):
        # EXTEND to assert that all lines in self have the same payment register when preparing the data to create the payment lines.
        assert len(self.payment_register_id) == 1, self.env._("All withholding lines in self must have the same payment register.")
        return super()._prepare_withholding_amls_create_values()
