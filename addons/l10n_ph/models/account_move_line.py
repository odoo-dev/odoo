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

    def _l10n_ph_line_qty(self):
        self.ensure_one()
        return self.quantity

    def _l10n_ph_regular_discount_reference_price(self):
        self.ensure_one()
        return self.price_unit

    @api.depends(
        "price_total",
        "tax_ids",
        "document_tax_mode",
        "l10n_ph_discount_privilege_id",
    )
    def _compute_l10n_ph_discount_amounts(self):
        super()._compute_l10n_ph_discount_amounts()

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
        super(AccountMoveLine, lines_without_privilege)._compute_discount_allocation_needed()
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
