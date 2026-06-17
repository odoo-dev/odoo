# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models
from odoo.tools import float_is_zero, frozendict


class AccountMoveLine(models.Model):
    _inherit = "account.move.line"

    l10n_ph_discount_privilege_id = fields.Many2one(
        "l10n_ph.discount.privilege",
        string="Discount Privilege",
        check_company=True,
        readonly=True,
    )
    l10n_ph_original_tax_ids = fields.Many2many(
        "account.tax",
        relation="account_move_line_l10n_ph_original_tax_rel",
        string="Original Taxes (pre-privilege)",
        store=True,
    )
    l10n_ph_discount_privilege_previous_discount = fields.Float(
        string="Previous Discount (pre-privilege)",
        readonly=True,
    )
    l10n_ph_regular_discount_amount = fields.Monetary(
        string="Regular Disc. Amount",
        currency_field="currency_id",
        compute="_compute_l10n_ph_discount_amounts",
        readonly=True,
    )
    l10n_ph_special_discount_amount = fields.Monetary(
        string="Special Disc. Amount",
        currency_field="currency_id",
        compute="_compute_l10n_ph_discount_amounts",
        readonly=True,
    )
    l10n_ph_original_price_unit = fields.Float(
        string="Original Price Unit (pre-privilege)",
        digits="Product Price",
        store=True,
    )

    # --- price_unit adjustment with privilege FP ---

    def _update_price_unit_from_privilege(self):
        """Called by the wizard after writing the privilege.
        First pass saves the original price_unit so it can be restored on removal.
        Second pass adapts price_unit through the privilege's fiscal position (FP),
        or restores the original when the privilege is cleared."""
        for line in self:
            if not line.l10n_ph_original_price_unit and line.price_unit:
                line.l10n_ph_original_price_unit = line.price_unit

        for line in self:
            if fiscal_position := line.l10n_ph_discount_privilege_id.fiscal_position_id:
                tax_ids = line.l10n_ph_original_tax_ids or line.tax_ids
                taxes_after_fp = fiscal_position.map_tax(tax_ids)
                line.price_unit = line.tax_ids._adapt_price_unit_to_another_taxes(
                    price_unit=line.l10n_ph_original_price_unit,
                    product=None,
                    original_taxes=tax_ids,
                    new_taxes=taxes_after_fp,
                    document_tax_mode=line.document_tax_mode,
                )
            elif line.l10n_ph_original_price_unit:
                line.price_unit = line.l10n_ph_original_price_unit
                if not line.l10n_ph_discount_privilege_id:
                    line.l10n_ph_original_price_unit = 0

    # --- Computed taxes with privilege FP ---

    def _update_tax_from_privilege(self):
        """Called by the wizard after writing the privilege.
        First pass saves the original taxes so they can be restored on removal.
        Second pass applies the fiscal position's tax mapping, restores original
        taxes for non-FP privileges, or clears them entirely on privilege removal."""
        for line in self:
            if (
                line.l10n_ph_discount_privilege_id.fiscal_position_id
                and not line.l10n_ph_original_tax_ids
                and line.tax_ids
            ):
                line.l10n_ph_original_tax_ids = line.tax_ids

        for line in self:
            if line.l10n_ph_original_tax_ids:
                if not line.l10n_ph_discount_privilege_id:
                    line.tax_ids = line.l10n_ph_original_tax_ids
                    line.l10n_ph_original_tax_ids = None
                elif (
                    fiscal_position
                    := line.l10n_ph_discount_privilege_id.fiscal_position_id
                ):
                    line.tax_ids = fiscal_position.map_tax(
                        line.l10n_ph_original_tax_ids,
                    )
                else:
                    line.tax_ids = line.l10n_ph_original_tax_ids

    # --- Discount allocation ---

    @api.depends(
        "l10n_ph_discount_privilege_id",
        "l10n_ph_special_discount_amount",
    )
    def _compute_discount_allocation_needed(self):
        """Override: for privilege lines, always replace super()'s output with
        entries using the privilege's account and the correct amount formula."""
        super()._compute_discount_allocation_needed()
        for line in self:
            priv = line.l10n_ph_discount_privilege_id
            if not priv:
                continue
            if not priv.account_id:
                line.discount_allocation_needed = False
                continue
            amount_currency = line.currency_id.round(
                line.move_id.direction_sign
                * (
                    line.quantity * line.price_unit * line.discount / 100
                    if priv.fiscal_position_id
                    else line.l10n_ph_special_discount_amount
                ),
            )
            amount = line.company_currency_id.round(
                amount_currency / line.currency_rate,
            )
            base_key = {
                "move_id": line.move_id._origin.id,
                "currency_rate": line.currency_rate,
            }
            line.discount_allocation_needed = [
                (
                    frozendict(account_id=line.account_id._origin.id, **base_key),
                    frozendict(
                        display_type="discount",
                        name=self.env._("Discount"),
                        amount_currency=amount_currency,
                        balance=amount,
                        analytic_distribution={},
                    ),
                ),
                (
                    frozendict(account_id=priv.account_id._origin.id, **base_key),
                    frozendict(
                        display_type="discount",
                        name=self.env._("Discount"),
                        amount_currency=-amount_currency,
                        balance=-amount,
                        analytic_distribution={},
                    ),
                ),
            ]

    # --- Discount amounts ---

    @api.depends(
        "quantity",
        "discount",
        "price_unit",
        "price_total",
        "product_id.lst_price",
        "tax_ids",
        "move_id.move_type",
        "document_tax_mode",
        "l10n_ph_discount_privilege_id",
    )
    def _compute_l10n_ph_discount_amounts(self):
        """Compute regular and special discount amounts for sale lines.
        Special discount: for privileged lines, back-calculates from price_total
        (or price_unit * qty when discount == 100%) so that:
          price_subtotal = price_unit * qty - special_discount_amount
        Regular discount: for non-privileged lines with a regular discount % or
        a discount from a sale-order pricelist / catalog list price."""
        for line in self:
            if line.display_type != "product" or not line.move_id.is_sale_document():
                line.l10n_ph_regular_discount_amount = 0.0
                line.l10n_ph_special_discount_amount = 0.0
                continue

            if line.l10n_ph_discount_privilege_id:
                if line.discount < 100.0:
                    line.l10n_ph_special_discount_amount = (
                        line.price_total * line.discount / (100.0 - line.discount)
                    )
                else:
                    # 100% discount — price_total is zero, use price_unit * qty instead,
                    # adding non-included taxes for non-FP lines.
                    base = line.price_unit * line.quantity
                    if not line.l10n_ph_discount_privilege_id.fiscal_position_id:
                        for tax in line.tax_ids.flatten_taxes_hierarchy():
                            if (
                                tax.amount_type == "percent"
                                and tax.amount > 0
                                and not tax._is_price_included(line.document_tax_mode)
                            ):
                                base *= 1.0 + tax.amount / 100.0
                    line.l10n_ph_special_discount_amount = base * line.discount / 100.0
                line.l10n_ph_regular_discount_amount = 0.0
            else:
                line.l10n_ph_special_discount_amount = 0.0

                if line.discount:
                    # Back-calculate regular discount amount from price_subtotal.
                    line.l10n_ph_regular_discount_amount = (
                        line.price_subtotal * line.discount / (100.0 - line.discount)
                    )
                else:
                    # No explicit discount — infer from pricelist / catalog list price
                    # vs the actual unit price.
                    if "sale_line_ids" in line._fields and line.sale_line_ids:
                        sale_line = line.sale_line_ids[:1]
                        reference_price = sale_line.price_unit
                        if (
                            not sale_line.discount
                            and sale_line.pricelist_item_id
                            and not sale_line.pricelist_item_id._show_discount()
                        ):
                            base_price = (
                                sale_line._get_pricelist_price_before_discount()
                            )
                            if not float_is_zero(
                                base_price,
                                precision_rounding=sale_line.currency_id.rounding,
                            ):
                                reference_price = base_price
                    elif line.product_id:
                        reference_price = line.product_id.lst_price
                    else:
                        reference_price = line.price_unit

                    if line.price_unit and reference_price > line.price_unit:
                        line.l10n_ph_regular_discount_amount = (
                            line.price_subtotal
                            * (reference_price - line.price_unit)
                            / line.price_unit
                        )
                    else:
                        line.l10n_ph_regular_discount_amount = 0.0

    # --- Preview helper for wizard ---

    def _l10n_ph_get_preview_discount_amount(self, privilege):
        self.ensure_one()
        if not privilege or self.discount >= 100.0:
            return 0.0
        if privilege == self.l10n_ph_discount_privilege_id:
            return self.l10n_ph_special_discount_amount
        if privilege.fiscal_position_id:
            excluded = self.price_subtotal / (1.0 - self.discount / 100.0)
            return excluded * privilege.discount_amount / 100.0
        included = self.price_total / (1.0 - self.discount / 100.0)
        return included * privilege.discount_amount / 100.0
