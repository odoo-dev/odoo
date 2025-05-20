# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, fields, models


class AccountPaymentWithholdingLine(models.Model):
    _name = 'account.payment.withholding.line'
    _inherit = "account.withholding.line"
    _description = 'Payment withholding line'
    _check_company_auto = True

    # ------------------
    # Fields declaration
    # ------------------

    payment_id = fields.Many2one(
        comodel_name='account.payment',
        required=True,
        ondelete='cascade',
    )

    # --------------------------------
    # Compute, inverse, search methods
    # --------------------------------

    def _get_default_base_amount_when_no_source_currency(self):
        self.ensure_one()
        return self.payment_id.amount

    @api.depends('payment_id.amount')
    def _compute_original_amounts(self):
        # Extended to add the dependency
        super()._compute_original_amounts()

    @api.depends('payment_id.payment_type')
    def _compute_type_tax_use(self):
        for line in self:
            line.type_tax_use = 'sale' if line.payment_id.payment_type == 'inbound' else 'purchase'

    @api.depends('payment_register_id.amount')
    def _compute_comodel_full_amount(self):
        for line in self:
            line.comodel_full_amount = line.payment_register_id.amount

    @api.depends('payment_id.date')
    def _compute_comodel_date(self):
        for line in self:
            line.comodel_date = line.payment_id.date

    @api.depends('payment_id.payment_type')
    def _compute_comodel_payment_type(self):
        for line in self:
            line.comodel_payment_type = line.payment_id.payment_type

    @api.depends('payment_id')
    def _compute_company_id(self):
        for line in self:
            line.company_id = line.payment_id.company_id

    @api.depends('payment_id')
    def _compute_comodel_currency_id(self):
        for line in self:
            line.comodel_currency_id = line.payment_id.currency_id


    # -----------------------
    # CRUD, inherited methods
    # -----------------------

    def _prepare_withholding_amls_create_values(self):
        # EXTEND to assert that all lines in self have the same payment when preparing the data to create the payment lines.
        assert len(self.payment_id) == 1, self.env._("All withholding lines in self must have the same payment.")
        return super()._prepare_withholding_amls_create_values()
