# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models
from odoo.exceptions import UserError
from odoo.fields import Command


class L10nPhDiscountPrivilegeWizard(models.TransientModel):
    _name = "l10n_ph.discount.privilege.wizard"
    _description = "Discount Privilege Wizard"

    move_id = fields.Many2one("account.move")
    company_id = fields.Many2one(related="move_id.company_id", readonly=True)
    currency_id = fields.Many2one(related="move_id.currency_id", readonly=True)
    privilege_id = fields.Many2one(
        "l10n_ph.discount.privilege",
        string="Privilege Applied",
        check_company=True,
    )
    apply_on = fields.Selection(
        selection=[
            ("all", "All Order Lines"),
            ("product_category", "Product Categories"),
            ("product", "Products"),
        ],
        string="Apply On",
        default="all",
        required=True,
    )
    product_ids = fields.Many2many(
        "product.product",
        relation="l10n_ph_discount_privilege_wizard_product_rel",
        string="Products",
    )
    category_ids = fields.Many2many("product.category", string="Product Categories")
    available_product_ids = fields.Many2many(
        "product.product",
        relation="l10n_ph_discount_privilege_wizard_available_product_rel",
        compute="_compute_available_filters",
    )
    available_category_ids = fields.Many2many(
        "product.category",
        compute="_compute_available_filters",
    )
    line_ids = fields.One2many(
        "l10n_ph.discount.privilege.wizard.line",
        "wizard_id",
        string="Invoice Lines",
    )
    has_applied_privileges = fields.Boolean(
        compute="_compute_has_applied_privileges",
    )

    @api.depends("line_ids.has_applied_discount_privilege")
    def _compute_has_applied_privileges(self):
        for wizard in self:
            wizard.has_applied_privileges = any(
                line.has_applied_discount_privilege for line in wizard.line_ids
            )

    @api.model_create_multi
    def create(self, vals_list):
        """Autopopulate line_ids from the invoice, excluding discount-allocation
        lines (which are handled by other modules and should not receive privileges)."""
        for vals in vals_list:
            if not vals.get("move_id"):
                raise UserError(
                    self.env._(
                        "A customer invoice or credit note is required to apply discount privileges.",
                    ),
                )
            if "line_ids" not in vals:
                move = self.env["account.move"].browse(vals["move_id"])
                invoice_lines = (
                    move.invoice_line_ids - move.invoice_line_ids._get_discount_lines()
                )
                vals["line_ids"] = [
                    Command.create(
                        {
                            "invoice_line_id": line.id,
                        },
                    )
                    for line in invoice_lines
                    if line.display_type == "product"
                ]
        wizards = super().create(vals_list)
        for wizard in wizards:
            wizard._recompute_line_previews()
        return wizards

    def _line_matches_scope(self, source):
        self.ensure_one()
        if self.apply_on == "all":
            return True
        if self.apply_on == "product_category":
            return source.product_id.categ_id.id in self.category_ids.ids
        if self.apply_on == "product":
            return (
                bool(self.product_ids) and source.product_id.id in self.product_ids.ids
            )
        return False

    def _get_preview_privilege_for_line(self, source):
        self.ensure_one()
        if self.privilege_id and self._line_matches_scope(source):
            return self.privilege_id
        return source.l10n_ph_discount_privilege_id

    def _recompute_line_previews(self):
        """Sync each wizard line's preview fields (discount %, discount amount)
        with the currently selected privilege and scope filters."""
        self.ensure_one()
        updates = []
        for line in self.line_ids:
            source = line._get_line_source()
            if not source:
                continue
            privilege = self._get_preview_privilege_for_line(source)
            vals = {
                "has_discount_privilege": bool(privilege),
                "has_applied_discount_privilege": bool(
                    source.l10n_ph_discount_privilege_id,
                ),
                "discount": privilege.discount_amount if privilege else 0.0,
            }
            if not privilege:
                vals["discount_amount"] = 0.0
            elif privilege == source.l10n_ph_discount_privilege_id:
                vals["discount_amount"] = source.l10n_ph_special_discount_amount
            else:
                vals["discount_amount"] = source._l10n_ph_get_preview_discount_amount(
                    privilege=privilege,
                )
            updates.append(Command.update(line.id, vals))
        self.line_ids = updates

    def _check_can_modify(self):
        self.ensure_one()
        if not (self.move_id.state == "draft" and self.move_id.is_sale_document()):
            raise UserError(
                self.env._(
                    "Discount privileges can only be modified on draft customer invoices and credit notes.",
                ),
            )

    def _check_scope_inputs(self):
        self.ensure_one()
        if self.apply_on == "product_category" and not self.category_ids:
            raise UserError(self.env._("Please select at least one product category."))
        if self.apply_on == "product" and not self.product_ids:
            raise UserError(self.env._("Please select at least one product."))

    def action_confirm(self):
        """Apply the selected privilege to the invoice.
        Writes the privilege on each matching line, then calls
        _update_tax_from_privilege, _update_price_unit_from_privilege, and
        _update_discount_from_privilege so the FP takes effect without waiting
        for @api.depends recomputation."""
        self.ensure_one()
        self._check_can_modify()
        if not self.privilege_id:
            return {"type": "ir.actions.act_window_close"}
        if self.privilege_id.company_id != self.company_id:
            raise UserError(
                self.env._("The selected privilege belongs to another company."),
            )
        self._check_scope_inputs()

        privilege = self.privilege_id
        for wiz_line in self.line_ids:
            source = wiz_line._get_line_source()
            if not source or not self._line_matches_scope(source):
                continue
            if not source.l10n_ph_discount_privilege_id:
                source.l10n_ph_original_discount = source.discount
            source.l10n_ph_discount_privilege_id = privilege.id
            source._update_tax_from_privilege()
            source._update_price_unit_from_privilege()
            source._update_discount_from_privilege()
        return {"type": "ir.actions.act_window_close"}

    def action_remove_all(self):
        self.ensure_one()
        self._check_can_modify()
        for wiz_line in self.line_ids:
            wiz_line._remove_discount_privilege()
        return {"type": "ir.actions.act_window_close"}

    @api.depends(
        "line_ids.invoice_line_id.product_id",
        "line_ids.invoice_line_id.product_id.categ_id",
    )
    def _compute_available_filters(self):
        for wizard in self:
            products = wizard.line_ids.invoice_line_id.product_id
            wizard.available_product_ids = products
            wizard.available_category_ids = products.categ_id

    @api.onchange("apply_on")
    def _onchange_apply_on(self):
        if self.apply_on != "product":
            self.product_ids = False
        if self.apply_on != "product_category":
            self.category_ids = False
        self._recompute_line_previews()

    @api.onchange("category_ids", "product_ids")
    def _onchange_scope_filters(self):
        self._recompute_line_previews()

    @api.onchange("privilege_id")
    def _onchange_privilege_id(self):
        for wizard in self:
            if not wizard.privilege_id:
                continue
            categories = (
                wizard.privilege_id.applied_to_category_ids
                & wizard.available_category_ids
            )
            if categories:
                wizard.apply_on = "product_category"
                wizard.category_ids = categories
            wizard._recompute_line_previews()


class L10nPhDiscountPrivilegeWizardLine(models.TransientModel):
    _name = "l10n_ph.discount.privilege.wizard.line"
    _description = "Discount Privilege Wizard Line"

    wizard_id = fields.Many2one(
        "l10n_ph.discount.privilege.wizard",
        required=True,
        ondelete="cascade",
    )
    invoice_line_id = fields.Many2one("account.move.line", required=True)
    name = fields.Char(
        related="invoice_line_id.name",
        string="Label",
    )
    category_id = fields.Many2one(
        related="invoice_line_id.product_id.categ_id",
        string="Product Category",
    )
    currency_id = fields.Many2one(related="wizard_id.currency_id")
    has_discount_privilege = fields.Boolean()
    has_applied_discount_privilege = fields.Boolean()
    discount = fields.Float(
        string="Discount Applied (%)",
        digits="Discount",
    )
    discount_amount = fields.Monetary(
        string="Discount Amount",
        currency_field="currency_id",
    )

    def _get_line_source(self):
        self.ensure_one()
        return self.invoice_line_id

    def _remove_discount_privilege(self):
        """Clear the privilege on the linked source line and restore the original taxes, price unit, and discount."""
        self.ensure_one()
        source = self._get_line_source()
        if not source or not source.l10n_ph_discount_privilege_id:
            return False
        source.l10n_ph_discount_privilege_id = False
        source._update_tax_from_privilege()
        source._update_price_unit_from_privilege()
        source._update_discount_from_privilege()
        return True

    def action_remove_line_discount(self):
        self.ensure_one()
        if not self._remove_discount_privilege():
            return False
        self.wizard_id._recompute_line_previews()
        return self.wizard_id._get_records_action(
            target="new",
            name=self.env._("Discount Privilege"),
        )
