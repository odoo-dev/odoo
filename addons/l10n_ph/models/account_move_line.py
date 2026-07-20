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
    l10n_ph_original_price_unit = fields.Float(
        string="Original Price Unit (pre-privilege)",
        digits="Product Price",
        store=True,
    )
    l10n_ph_original_discount = fields.Float(
        string="Original Discount (pre-privilege)",
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

    # --- price_unit adjustment with privilege FP ---

    def _update_price_unit_from_privilege(self):
        """Called by the wizard after writing the privilege.
        Saves the original price_unit so it can be restored on removal, then
        adapts price_unit through the privilege's fiscal position (FP), or
        restores the original price_unit when the privilege is cleared."""
        for line in self:
            fiscal_position = line.l10n_ph_discount_privilege_id.fiscal_position_id
            if fiscal_position:
                if not line.l10n_ph_original_price_unit and line.price_unit:
                    line.l10n_ph_original_price_unit = line.price_unit
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
                line.l10n_ph_original_price_unit = 0

    # --- Computed taxes with privilege FP ---

    def _update_tax_from_privilege(self):
        """Called by the wizard after writing the privilege.
        Saves the original taxes so they can be restored on removal, then
        applies the fiscal position's tax mapping. Non-FP privileges keep their
        original taxes, which are restored when the privilege is cleared."""
        for line in self:
            fiscal_position = line.l10n_ph_discount_privilege_id.fiscal_position_id
            if fiscal_position:
                if not line.l10n_ph_original_tax_ids and line.tax_ids:
                    line.l10n_ph_original_tax_ids = line.tax_ids
                line.tax_ids = fiscal_position.map_tax(line.l10n_ph_original_tax_ids)
            elif line.l10n_ph_original_tax_ids:
                line.tax_ids = line.l10n_ph_original_tax_ids
                line.l10n_ph_original_tax_ids = None

    # --- Discount with privilege ---

    def _update_discount_from_privilege(self):
        """Called by the wizard after writing the privilege.
        Applies the privilege's discount percentage, or restores the original
        discount when the privilege is cleared."""
        for line in self:
            if line.l10n_ph_discount_privilege_id:
                line.discount = line.l10n_ph_discount_privilege_id.discount_amount
            else:
                line.discount = line.l10n_ph_original_discount or 0.0
                line.l10n_ph_original_discount = 0.0

    # --- Discount allocation ---

    @api.depends("l10n_ph_discount_privilege_id", "l10n_ph_special_discount_amount")
    def _compute_discount_allocation_needed(self):
        """Override allocation for privileged lines.
        Default = qty * price_unit * discount/100 (VAT-exclusive). SC/PWD
        discounts are statutory and computed on the VAT-inclusive amount
        (e.g., 5% of 840 = 42, not 750 * 5% = 37.5), so for non-FP privileges we
        allocate l10n_ph_special_discount_amount (VAT-inclusive) to the
        privilege's account instead. super() handles non-privileged lines only."""
        lines_without_privilege = self.filtered(
            lambda l: not l.l10n_ph_discount_privilege_id
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
        """Compute l10n_ph_special_discount_amount and
        l10n_ph_regular_discount_amount for sale lines (SLSP/BOA reporting).

        Special (privileged lines): VAT-inclusive discount = price_total *
        discount/(100-discount); at 100% price_total is 0, so it is recomputed
        from price_unit*qty with taxes via the tax engine. This keeps the
        reported discount consistent with the FP tax treatment.

        Regular (non-privileged): explicit discount % back-computed from
        price_subtotal, or inferred from pricelist/catalog list price vs. the
        invoiced unit price. Never reported as a privilege discount."""
        for line in self:
            if line.display_type != "product" or not line.move_id.is_sale_document():
                line.l10n_ph_regular_discount_amount = 0.0
                line.l10n_ph_special_discount_amount = 0.0
                continue

            if line.l10n_ph_discount_privilege_id:
                line.l10n_ph_regular_discount_amount = 0.0
                if line.discount < 100.0:
                    line.l10n_ph_special_discount_amount = (
                        line.price_total * line.discount / (100.0 - line.discount)
                    )
                else:
                    # 100% discount — price_total is zero, so recompute the
                    # tax-inclusive amount (with no discount) and use it as the
                    # discounted amount, avoiding manual tax roundings.
                    company = line.company_id or self.env.company
                    base_line = line.move_id._prepare_product_base_line_for_taxes_computation(line)
                    base_line['discount'] = 0.0
                    self.env['account.tax']._add_tax_details_in_base_line(base_line, company)
                    self.env['account.tax']._round_base_lines_tax_details([base_line], company)
                    line.l10n_ph_special_discount_amount = base_line['tax_details']['total_included_currency']
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
