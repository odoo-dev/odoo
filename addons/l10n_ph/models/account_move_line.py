# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models
from odoo.tools import frozendict


class AccountMoveLine(models.Model):
    _inherit = ["account.move.line", "l10n_ph.discount.privilege.line.mixin"]
    _name = "account.move.line"

    l10n_ph_original_tax_ids = fields.Many2many(
        relation="account_move_line_l10n_ph_original_tax_rel",
    )

    # --- Model-specific hooks for the mixin ---

    def _l10n_ph_skip_discount_amounts(self):
        self.ensure_one()
        return self.display_type != "product" or not self.move_id.is_sale_document()

    def _l10n_ph_get_discount_price_details(self):
        """Return the gross (pre-discount) price amounts and the discount
        amounts derived from the current AML.

        At 100% discount, price_subtotal/price_total are zero, so the gross
        values are recomputed from price_unit*qty with the tax engine to avoid
        manual tax roundings.
        """
        self.ensure_one()
        if self.discount >= 100:
            company = self.company_id or self.env.company
            base_line = self.move_id._prepare_product_base_line_for_taxes_computation(
                self,
            )
            base_line["discount"] = 0.0
            self.env["account.tax"]._add_tax_details_in_base_line(base_line, company)
            self.env["account.tax"]._round_base_lines_tax_details([base_line], company)
            gross_price_subtotal = self.price_unit * self.quantity
            gross_price_total = base_line["tax_details"]["total_included_currency"]
        else:
            gross_price_subtotal = self.price_subtotal / (
                1.0 - (self.discount / 100.0)
            )
            gross_price_total = self.price_total / (1.0 - (self.discount / 100.0))
        return (
            gross_price_subtotal,
            gross_price_subtotal - self.price_subtotal,
            gross_price_total,
            gross_price_total - self.price_total,
        )

    @api.depends(
        "price_total",
        "price_subtotal",
        "tax_ids",
        "document_tax_mode",
        "l10n_ph_discount_privilege_id",
    )
    def _compute_l10n_ph_discount_amounts(self):
        super()._compute_l10n_ph_discount_amounts()

    # --- Price unit / taxes / discount helpers (called by the wizard) ---

    def _adjust_price_unit_from_privilege(self, price_unit, tax_ids):
        """Compute the new price_unit and original_price_unit to set on the
        line after applying (or removing) the privilege's fiscal position."""
        self.ensure_one()
        fiscal_position = self.l10n_ph_discount_privilege_id.fiscal_position_id
        if fiscal_position:
            tax_ids = self.l10n_ph_original_tax_ids or tax_ids
            taxes_after_fp = fiscal_position.map_tax(tax_ids)
            new_price_unit = tax_ids._adapt_price_unit_to_another_taxes(
                price_unit=self.l10n_ph_original_price_unit or price_unit,
                product=None,
                original_taxes=tax_ids,
                new_taxes=taxes_after_fp,
                document_tax_mode=self.document_tax_mode,
            )
            original_price_unit = self.l10n_ph_original_price_unit or price_unit
        elif self.l10n_ph_original_price_unit:
            new_price_unit = self.l10n_ph_original_price_unit
            original_price_unit = 0.0
        else:
            new_price_unit = price_unit
            original_price_unit = 0.0
        return new_price_unit, original_price_unit

    def _adjust_taxes_from_privilege(self, tax_ids):
        """Compute the new tax_ids and original tax_ids to set on the line
        after applying (or removing) the privilege's fiscal position."""
        self.ensure_one()
        fiscal_position = self.l10n_ph_discount_privilege_id.fiscal_position_id
        if fiscal_position:
            original_taxes = self.l10n_ph_original_tax_ids or tax_ids
            new_taxes = fiscal_position.map_tax(original_taxes)
            return new_taxes, original_taxes
        if self.l10n_ph_original_tax_ids:
            return self.l10n_ph_original_tax_ids, None
        return tax_ids, self.l10n_ph_original_tax_ids

    # --- Discount allocation (invoice lines only) ---

    @api.depends("l10n_ph_discount_privilege_id", "l10n_ph_special_discount_amount")
    def _compute_discount_allocation_needed(self):
        """Override allocation for privileged lines.
        Default = qty * price_unit * discount/100 (VAT-exclusive). SC/PWD
        discounts are statutory and computed on the VAT-inclusive amount
        (e.g., 5% of 840 = 42, not 750 * 5% = 37.5), so for non-FP privileges we
        allocate l10n_ph_special_discount_amount (VAT-inclusive) to the
        privilege's account instead. super() handles non-privileged lines only."""
        lines_without_privilege = self.filtered(
            lambda line: not line.l10n_ph_discount_privilege_id,
        )
        super(
            AccountMoveLine, lines_without_privilege,
        )._compute_discount_allocation_needed()
        for line in self.filtered("l10n_ph_discount_privilege_id"):
            priv = line.l10n_ph_discount_privilege_id
            if not priv.account_id:
                line.discount_allocation_needed = False
                line.discount_allocation_dirty = True
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
            line.discount_allocation_dirty = True
