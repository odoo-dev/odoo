# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class L10nPhDiscountPrivilegeLineMixin(models.AbstractModel):
    """Shared logic for applying Philippine SC/PWD discount privileges on any
    document line (invoice lines, sale order lines, ...).

    Concrete models inherit this mixin and only provide the small model-specific
    hooks plus the correct `@api.depends` for `_compute_l10n_ph_discount_amounts`,
    which must list the quantity / document-tax-mode fields specific to that model.
    """

    _name = "l10n_ph.discount.privilege.line.mixin"
    _description = "Philippine Discount Privilege Line Mixin"

    currency_id = fields.Many2one("res.currency", string="Currency")

    l10n_ph_discount_privilege_id = fields.Many2one(
        "l10n_ph.discount.privilege",
        string="Discount Privilege",
        check_company=True,
        readonly=True,
    )
    l10n_ph_original_tax_ids = fields.Many2many(
        "account.tax",
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

    # --- Model-specific hooks ---

    def _l10n_ph_skip_discount_amounts(self):
        self.ensure_one()
        return bool(self.display_type)

    def _l10n_ph_line_qty(self):
        self.ensure_one()
        return self.quantity

    def _l10n_ph_regular_discount_reference_price(self):
        self.ensure_one()
        if self.product_id:
            return self.product_id.lst_price
        return self.price_unit

    # --- price_unit adjustment with privilege FP ---

    def _update_price_unit_from_privilege(self):
        """Save the original price_unit so it can be restored on removal, then
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
        """Save the original taxes so they can be restored on removal, then
        apply the fiscal position's tax mapping, restore original taxes for
        non-FP privileges, or clear them entirely on privilege removal."""
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
        for line in self:
            if line.l10n_ph_discount_privilege_id:
                line.discount = line.l10n_ph_discount_privilege_id.discount_amount
            else:
                line.discount = line.l10n_ph_original_discount or 0.0
                line.l10n_ph_original_discount = 0.0

    # --- Discount amounts ---

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
            if line._l10n_ph_skip_discount_amounts():
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
                    reference_price = line._l10n_ph_regular_discount_reference_price()
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
