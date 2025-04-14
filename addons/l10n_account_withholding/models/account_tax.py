# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, fields, models
from odoo.exceptions import UserError


class AccountTax(models.Model):
    _inherit = 'account.tax'

    # ------------------
    # Fields declaration
    # ------------------

    is_withholding_tax_on_payment = fields.Boolean(
        string="Withholding On Payment",
        help="If enabled, this tax will not affect journal entries until the registration of payments.",
    )
    withholding_sequence_id = fields.Many2one(
        string='Withholding Sequence',
        help='Label displayed on Journal Items and Payment Receipts.',
        comodel_name='ir.sequence',
        copy=False,
        check_company=True,
    )

    # ----------------------------
    # Onchange, Constraint methods
    # ----------------------------

    @api.onchange('is_withholding_tax_on_payment')
    def _onchange_is_withholding_tax_on_payment(self):
        """ Ensure that we don't keep cash basis enabled if it was before checking the withholding tax option. """
        if self.is_withholding_tax_on_payment:
            self.tax_exigibility = 'on_invoice'
            self.price_include_override = 'tax_excluded'

    @api.constrains('amount_type', 'is_withholding_tax_on_payment')
    def _check_amount_type(self):
        for tax in self:
            if tax.is_withholding_tax_on_payment and tax.amount_type in ['group', 'division']:
                raise UserError(tax.env._("Withholding On Payment taxes cannot use the 'Group of Taxes' or the 'Percentage Tax Included' computations."))

    # --------------------------------
    # Compute, inverse, search methods
    # --------------------------------

    @api.depends('name', 'invoice_label')
    def _compute_tax_label(self):
        withholding_taxes = self.filtered('is_withholding_tax_on_payment')
        for tax in withholding_taxes:
            # Removes the fallback on the tax name when dealing with withholding taxes.
            tax.tax_label = tax.invoice_label

        super(AccountTax, self - withholding_taxes)._compute_tax_label()

    # -----------------------
    # CRUD, inherited methods
    # -----------------------

    def _eval_tax_amount_price_included(self, batch, raw_base, evaluation_context):
        # EXTENDS 'account'
        self.ensure_one()
        if self.is_withholding_tax_on_payment:
            return -super()._eval_tax_amount_price_excluded(batch, raw_base, evaluation_context)
        return super()._eval_tax_amount_price_included(batch, raw_base, evaluation_context)

    def _eval_tax_amount_price_excluded(self, batch, raw_base, evaluation_context):
        # EXTENDS 'account'
        self.ensure_one()
        if self.is_withholding_tax_on_payment:
            return -super()._eval_tax_amount_price_excluded(batch, raw_base, evaluation_context)
        return super()._eval_tax_amount_price_excluded(batch, raw_base, evaluation_context)

    @api.model
    def _add_tax_details_in_base_line(self, base_line, company, rounding_method=None):
        # EXTENDS 'account'
        if base_line.get('calculate_withholding_taxes'):
            super()._add_tax_details_in_base_line(base_line, company, rounding_method=rounding_method)
            return

        new_base_line = {
            **base_line,
            'tax_ids': base_line["tax_ids"].filtered(lambda t: not t.is_withholding_tax_on_payment),
        }
        super()._add_tax_details_in_base_line(new_base_line, company, rounding_method=rounding_method)
        new_base_line.pop('tax_ids')
        base_line.update(new_base_line)
