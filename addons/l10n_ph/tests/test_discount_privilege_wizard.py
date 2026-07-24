# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.exceptions import UserError, ValidationError
from odoo.fields import Command
from odoo.tests import tagged
from odoo.tools import mute_logger

from odoo.addons.l10n_ph.tests.common import TestPhCommon


@tagged("post_install_l10n", "post_install", "-at_install")
class TestDiscountPrivilegeWizard(TestPhCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        discount_group = cls.env.ref("l10n_ph.group_l10n_ph_discount_privilege")
        cls.env.user.write({"group_ids": [Command.link(discount_group.id)]})

        ChartTemplate = cls.env["account.chart.template"].with_company(
            cls.company_data["company"],
        )
        cls.tax_sale_12 = ChartTemplate.ref("l10n_ph_tax_sale_12")
        cls.tax_sale_0_exempt = ChartTemplate.ref("l10n_ph_tax_sale_0_exempt")
        cls.tax_sale_0_exempt_sc_pwd = ChartTemplate.ref(
            "l10n_ph_tax_sale_0_exempt_sc_pwd",
        )
        cls.fpos_sc_pwd = ChartTemplate.ref(
            "l10n_ph_fiscal_position_discount_privileges",
        )
        cls.base_tax = cls.tax_sale_12

        cls.tax_incl = cls._create_tax(
            "12% VAT INCL",
            12,
            price_include_override="tax_included",
        )
        cls.tax_sale_0_exempt_sc_pwd.write(
            {
                "original_tax_ids": [Command.link(cls.tax_incl.id)],
            },
        )
        cls.special_discount_account = cls.company_data["default_account_revenue"].copy(
            {
                "name": "Discount Privilege Account",
            },
        )
        cls.privilege = (
            cls.env["l10n_ph.discount.privilege"]
            .sudo()
            .create(
                {
                    "name": "Senior Citizen",
                    "discount_amount": 20.0,
                    "fiscal_position_id": cls.fpos_sc_pwd.id,
                    "account_id": cls.special_discount_account.id,
                },
            )
        )
        cls.privilege_without_tax = (
            cls.env["l10n_ph.discount.privilege"]
            .sudo()
            .create(
                {
                    "name": "Senior Citizen VAT EXCL",
                    "discount_amount": 20.0,
                    "account_id": cls.special_discount_account.id,
                },
            )
        )
        cls.privilege_with_categories = (
            cls.env["l10n_ph.discount.privilege"]
            .sudo()
            .create(
                {
                    "name": "PWD Category Scoped",
                    "discount_amount": 20.0,
                    "fiscal_position_id": cls.fpos_sc_pwd.id,
                    "account_id": cls.special_discount_account.id,
                    "applied_to_category_ids": [Command.set([])],
                },
            )
        )

        cls.category_a = cls.env["product.category"].create({"name": "Category A"})
        cls.category_b = cls.env["product.category"].create({"name": "Category B"})
        cls.product_a = cls.env["product.product"].create(
            {
                "name": "Product A",
                "categ_id": cls.category_a.id,
                "list_price": 120.0,
            },
        )
        cls.product_b = cls.env["product.product"].create(
            {
                "name": "Product B",
                "categ_id": cls.category_b.id,
                "list_price": 220.0,
            },
        )
        cls.privilege_with_categories.write(
            {"applied_to_category_ids": [Command.set(cls.category_a.ids)]},
        )

    @classmethod
    def _create_tax(
        cls,
        name,
        amount,
        amount_type="percent",
        type_tax_use="sale",
        tax_exigibility="on_invoice",
        **kwargs,
    ):
        vals = {
            "name": name,
            "amount": amount,
            "amount_type": amount_type,
            "type_tax_use": type_tax_use,
            "tax_exigibility": tax_exigibility,
            "invoice_repartition_line_ids": [
                Command.create({"factor_percent": 100, "repartition_type": "base"}),
                Command.create({"factor_percent": 100, "repartition_type": "tax"}),
            ],
            "refund_repartition_line_ids": [
                Command.create({"factor_percent": 100, "repartition_type": "base"}),
                Command.create({"factor_percent": 100, "repartition_type": "tax"}),
            ],
            **kwargs,
        }
        return cls.env["account.tax"].create(vals)

    def _line_vals(
        self,
        *,
        name="Line",
        product=None,
        quantity=1.0,
        price_unit=100.0,
        tax=None,
        discount=0.0,
        **extra,
    ):
        vals = {
            "name": name,
            "product_id": (product or self.product_a).id,
            "account_id": self.company_data["default_account_revenue"].id,
            "quantity": quantity,
            "price_unit": price_unit,
        }
        if tax is None:
            tax = self.base_tax
        if tax:
            vals["tax_ids"] = [Command.set(tax.ids)]
        if discount:
            vals["discount"] = discount
        vals.update(extra)
        return vals

    def _create_invoice(self, *line_vals):
        return self.env["account.move"].create(
            {
                "move_type": "out_invoice",
                "partner_id": self.partner_a.id,
                "invoice_line_ids": [Command.create(vals) for vals in line_vals],
            },
        )

    def _create_wizard(self, invoice, **vals):
        return self.env["l10n_ph.discount.privilege.wizard"].create(
            {"move_id": invoice.id, **vals},
        )

    def _assert_discount_allocation(self, invoice, line, amount):
        self.assertRecordValues(
            invoice.line_ids.filtered(
                lambda line_item: line_item.display_type == "discount",
            ).sorted(
                "amount_currency",
            ),
            [
                {
                    "account_id": line.account_id.id,
                    "amount_currency": -amount,
                },
                {
                    "account_id": self.special_discount_account.id,
                    "amount_currency": amount,
                },
            ],
        )

    # ============================================================
    #  Privilege Model CRUD
    # ============================================================

    def test_privilege_crud(self):
        priv = self.env["l10n_ph.discount.privilege"].sudo().create({
            "name": "Test Privilege",
            "discount_type": "sc",
            "discount_amount": 20.0,
            "account_id": self.special_discount_account.id,
        })
        self.assertEqual(priv.name, "Test Privilege")
        self.assertEqual(priv.discount_type, "sc")
        self.assertEqual(priv.discount_amount, 20.0)
        self.assertTrue(priv.exists())

        priv.write({"discount_amount": 25.0, "discount_type": "pwd"})
        self.assertEqual(priv.discount_amount, 25.0)
        self.assertEqual(priv.discount_type, "pwd")

        priv_id = priv.id
        priv.unlink()
        self.assertFalse(self.env["l10n_ph.discount.privilege"].browse(priv_id).exists())

    def test_privilege_discount_type_values(self):
        for dtype in ("pwd", "sc", "special"):
            priv = self.env["l10n_ph.discount.privilege"].sudo().create({
                "name": f"Test {dtype}",
                "discount_type": dtype,
                "discount_amount": 10.0,
                "account_id": self.special_discount_account.id,
            })
            self.assertEqual(priv.discount_type, dtype)
            priv.unlink()

    def test_privilege_model_constraint_positive_amount(self):
        with self.assertRaises(ValidationError):
            self.env["l10n_ph.discount.privilege"].sudo().create({
                "name": "Invalid Zero",
                "discount_amount": 0.0,
                "account_id": self.special_discount_account.id,
            })
        with self.assertRaises(ValidationError):
            self.env["l10n_ph.discount.privilege"].sudo().create({
                "name": "Invalid Negative",
                "discount_amount": -5.0,
                "account_id": self.special_discount_account.id,
            })
        with self.assertRaises(ValidationError):
            self.env["l10n_ph.discount.privilege"].sudo().create({
                "name": "Invalid Over 100",
                "discount_amount": 101.0,
                "account_id": self.special_discount_account.id,
            })

    def test_privilege_unique_name_per_company(self):
        self.env["l10n_ph.discount.privilege"].sudo().create({
            "name": "Duplicate Name",
            "discount_amount": 20.0,
            "account_id": self.special_discount_account.id,
        })
        with self.assertRaises(Exception), mute_logger('odoo.sql_db'):
            self.env["l10n_ph.discount.privilege"].sudo().create({
                "name": "Duplicate Name",
                "discount_amount": 30.0,
                "account_id": self.special_discount_account.id,
            })

    def test_privilege_archive_in_use(self):
        invoice = self._create_invoice(
            self._line_vals(name="Line A", product=self.product_a, price_unit=100.0),
        )
        wizard = self._create_wizard(invoice, privilege_id=self.privilege.id, apply_on="all")
        wizard.action_confirm()
        with self.assertRaises(ValidationError):
            self.privilege.unlink()
        self.privilege.active = False
        self.assertFalse(self.privilege.active)

    def test_privilege_applied_to_categories(self):
        cat_a = self.env["product.category"].create({"name": "Cat A"})
        cat_b = self.env["product.category"].create({"name": "Cat B"})
        prod_a = self.env["product.product"].create({"name": "Prod A", "categ_id": cat_a.id})
        prod_b = self.env["product.product"].create({"name": "Prod B", "categ_id": cat_b.id})
        priv = self.env["l10n_ph.discount.privilege"].sudo().create({
            "name": "Cat Scoped",
            "discount_amount": 15.0,
            "account_id": self.special_discount_account.id,
            "applied_to_category_ids": [Command.set(cat_a.ids)],
        })
        invoice = self._create_invoice(
            self._line_vals(name="Line A", product=prod_a, price_unit=100.0),
            self._line_vals(name="Line B", product=prod_b, price_unit=200.0),
        )
        wizard = self._create_wizard(invoice)
        wizard.privilege_id = priv
        wizard._onchange_privilege_id()
        self.assertEqual(wizard.apply_on, "product_category")
        self.assertEqual(wizard.category_ids, cat_a)

    # ============================================================
    #  Wizard Basics — open, preview, confirm, computed field
    # ============================================================

    def test_open_wizard_action_returns_correct_action(self):
        invoice = self._create_invoice(
            self._line_vals(name="Line A", product=self.product_a, price_unit=100.0),
        )
        action = invoice.action_open_discount_privilege_wizard()
        self.assertEqual(action["res_model"], "l10n_ph.discount.privilege.wizard")
        self.assertIn("res_id", action)
        wizard = self.env["l10n_ph.discount.privilege.wizard"].browse(action["res_id"])
        self.assertTrue(wizard.exists())
        self.assertEqual(wizard.move_id, invoice)
        self.assertEqual(wizard.line_ids.invoice_line_id, invoice.invoice_line_ids)

    def test_preview_shows_correct_values_without_writing_invoice(self):
        invoice = self._create_invoice(
            self._line_vals(name="Line A", product=self.product_a, price_unit=100.0),
            self._line_vals(name="Line B", product=self.product_b, price_unit=200.0),
        )
        wizard = self._create_wizard(
            invoice,
            privilege_id=self.privilege.id,
            apply_on="product_category",
            category_ids=[Command.set(self.category_a.ids)],
        )
        line_a, line_b = wizard.line_ids.sorted("id")
        self.assertTrue(line_a.has_discount_privilege)
        self.assertEqual(line_a.discount, 20.0)
        self.assertAlmostEqual(line_a.discount_amount, 20.0)
        self.assertFalse(line_b.has_discount_privilege)

        inv_line_a, inv_line_b = invoice.invoice_line_ids.sorted("sequence")
        self.assertFalse(inv_line_a.l10n_ph_discount_privilege_id)
        self.assertFalse(inv_line_b.l10n_ph_discount_privilege_id)
        self.assertEqual(inv_line_a.discount, 0.0)
        self.assertEqual(inv_line_b.discount, 0.0)

    def test_preview_confirm_writes_privilege_to_invoice(self):
        invoice = self._create_invoice(
            self._line_vals(name="Line A", product=self.product_a, price_unit=100.0),
            self._line_vals(name="Line B", product=self.product_b, price_unit=200.0),
        )
        wizard = self._create_wizard(
            invoice,
            privilege_id=self.privilege.id,
            apply_on="product_category",
            category_ids=[Command.set(self.category_a.ids)],
        )
        wizard.action_confirm()

        inv_line_a, inv_line_b = invoice.invoice_line_ids.sorted("sequence")
        self.assertEqual(inv_line_a.l10n_ph_discount_privilege_id, self.privilege)
        self.assertFalse(inv_line_b.l10n_ph_discount_privilege_id)

    def test_has_discount_privilege_computed_field(self):
        invoice = self._create_invoice(
            self._line_vals(name="Line A", product=self.product_a, price_unit=100.0),
        )
        self.assertFalse(invoice.l10n_ph_has_discount_privilege)

        wizard = self._create_wizard(
            invoice,
            privilege_id=self.privilege.id,
            apply_on="all",
        )
        wizard.action_confirm()
        self.assertTrue(invoice.l10n_ph_has_discount_privilege)

        wizard.action_remove_all()
        self.assertFalse(invoice.l10n_ph_has_discount_privilege)

    # ============================================================
    #  Apply Scopes — all / product / product_category
    # ============================================================

    def test_apply_all_scope_applies_to_all_lines(self):
        invoice = self._create_invoice(
            self._line_vals(name="Line A", product=self.product_a, price_unit=100.0),
            self._line_vals(name="Line B", product=self.product_b, price_unit=200.0),
        )
        wizard = self._create_wizard(
            invoice,
            privilege_id=self.privilege.id,
            apply_on="all",
        )
        wizard.action_confirm()
        for line in invoice.invoice_line_ids:
            self.assertEqual(line.l10n_ph_discount_privilege_id, self.privilege)
            self.assertEqual(line.discount, 20.0)

    def test_apply_product_scope(self):
        invoice = self._create_invoice(
            self._line_vals(name="Line A", product=self.product_a, price_unit=100.0),
            self._line_vals(name="Line B", product=self.product_b, price_unit=200.0),
        )
        wizard = self._create_wizard(
            invoice,
            privilege_id=self.privilege.id,
            apply_on="product",
            product_ids=[Command.set([self.product_a.id])],
        )
        wizard.action_confirm()

        line_a, line_b = invoice.invoice_line_ids.sorted("sequence")
        self.assertEqual(line_a.l10n_ph_discount_privilege_id, self.privilege)
        self.assertFalse(line_b.l10n_ph_discount_privilege_id)
        self.assertEqual(line_a.discount, 20.0)
        self.assertEqual(line_b.discount, 0.0)

    def test_apply_product_category_scope_matches_lines(self):
        invoice = self._create_invoice(
            self._line_vals(name="Line A", product=self.product_a, price_unit=100.0),
            self._line_vals(name="Line B", product=self.product_b, price_unit=200.0),
        )
        wizard = self._create_wizard(
            invoice,
            privilege_id=self.privilege.id,
            apply_on="product_category",
            category_ids=[Command.set(self.category_a.ids)],
        )
        wizard.action_confirm()

        line_a, line_b = invoice.invoice_line_ids.sorted("sequence")
        self.assertEqual(line_a.discount, 20.0)
        self.assertEqual(line_a.l10n_ph_discount_privilege_id, self.privilege)
        self.assertEqual(line_b.discount, 0.0)
        self.assertEqual(line_b.tax_ids, self.base_tax)

    def test_apply_requires_category_when_scope_is_product_category(self):
        invoice = self._create_invoice(
            self._line_vals(name="Line A", product=self.product_a, price_unit=100.0),
        )
        wizard = self._create_wizard(
            invoice,
            privilege_id=self.privilege.id,
            apply_on="product_category",
        )
        with self.assertRaises(UserError):
            wizard.action_confirm()

    def test_apply_requires_product_when_scope_is_product(self):
        invoice = self._create_invoice(
            self._line_vals(name="Line A", product=self.product_a, price_unit=100.0),
        )
        wizard = self._create_wizard(
            invoice,
            privilege_id=self.privilege.id,
            apply_on="product",
        )
        with self.assertRaises(UserError):
            wizard.action_confirm()

    # ============================================================
    #  Tax Mapping via Fiscal Position
    # ============================================================

    def test_apply_fp_maps_taxes_and_discount_math(self):
        invoice = self._create_invoice(
            self._line_vals(name="Line A", product=self.product_a, price_unit=100.0),
        )
        wizard = self._create_wizard(
            invoice,
            privilege_id=self.privilege.id,
            apply_on="all",
        )
        wizard.action_confirm()

        line = invoice.invoice_line_ids
        self.assertEqual(line.tax_ids, self.tax_sale_0_exempt_sc_pwd)
        self.assertAlmostEqual(line.price_subtotal, 80.0)
        self.assertAlmostEqual(line.price_total, 80.0)
        self.assertAlmostEqual(line.l10n_ph_special_discount_amount, 20.0)
        self.assertAlmostEqual(invoice.amount_total, 80.0)

    def test_fp_maps_multiple_taxes(self):
        tax_12 = self.base_tax
        tax_local = self._create_tax("Local Tax", 2.0)

        fpos = self.env["account.fiscal.position"].create({
            "name": "Multi-tax FP",
        })
        sc_pwd_tax = self.tax_sale_0_exempt_sc_pwd
        sc_pwd_tax.write({"original_tax_ids": [Command.set([tax_12.id, tax_local.id])]})
        fpos.write({"tax_ids": [Command.set([sc_pwd_tax.id])]})
        self.fpos_sc_pwd.write({"tax_ids": [Command.set([sc_pwd_tax.id])]})

        priv = self.env["l10n_ph.discount.privilege"].sudo().create({
            "name": "Multi-tax FP",
            "discount_amount": 20.0,
            "fiscal_position_id": fpos.id,
            "account_id": self.special_discount_account.id,
        })

        invoice = self._create_invoice(
            self._line_vals(name="Line A", product=self.product_a, price_unit=100.0, tax=tax_12 + tax_local),
        )
        wizard = self._create_wizard(invoice, privilege_id=priv.id, apply_on="all")
        wizard.action_confirm()

        line = invoice.invoice_line_ids
        self.assertEqual(line.tax_ids, self.tax_sale_0_exempt_sc_pwd)
        self.assertAlmostEqual(line.l10n_ph_special_discount_amount, 20.0, places=2)

    def test_fp_with_non_1_to_1_mapping(self):
        tax_dest1 = self._create_tax("Dest 1", 0.0)
        tax_dest2 = self._create_tax("Dest 2", 0.0)

        fpos = self.env["account.fiscal.position"].create({
            "name": "Non-1:1 FP",
        })
        tax_dest1.write({"original_tax_ids": [Command.set([self.base_tax.id])]})
        tax_dest2.write({"original_tax_ids": [Command.set([self.base_tax.id])]})
        fpos.write({"tax_ids": [Command.set([tax_dest1.id, tax_dest2.id])]})

        priv = self.env["l10n_ph.discount.privilege"].sudo().create({
            "name": "Non-1:1 FP",
            "discount_amount": 20.0,
            "fiscal_position_id": fpos.id,
            "account_id": self.special_discount_account.id,
        })

        invoice = self._create_invoice(
            self._line_vals(name="Line A", product=self.product_a, price_unit=100.0),
        )
        wizard = self._create_wizard(invoice, privilege_id=priv.id, apply_on="all")
        wizard.action_confirm()

        line = invoice.invoice_line_ids
        self.assertEqual(len(line.tax_ids), 2)
        self.assertIn(tax_dest1, line.tax_ids)
        self.assertIn(tax_dest2, line.tax_ids)

    # ============================================================
    #  Discount Math — tax-inclusive / tax-exclusive / VAT-able
    # ============================================================

    def test_apply_privilege_without_tax_keeps_existing_taxes(self):
        invoice = self._create_invoice(
            self._line_vals(name="Line A", product=self.product_a, price_unit=100.0),
        )
        wizard = self._create_wizard(
            invoice,
            privilege_id=self.privilege_without_tax.id,
            apply_on="all",
        )
        wizard.action_confirm()

        line = invoice.invoice_line_ids
        self.assertEqual(line.tax_ids, self.base_tax)
        self.assertEqual(line.l10n_ph_discount_privilege_id, self.privilege_without_tax)
        self.assertAlmostEqual(line.price_subtotal, 80.0)
        self.assertAlmostEqual(line.price_total, 89.6)
        self._assert_discount_allocation(invoice, line, 22.4)

    def test_apply_non_fp_privilege_on_tax_inclusive_line(self):
        privilege = (
            self.env["l10n_ph.discount.privilege"]
            .sudo()
            .create({
                "name": "SC 20% No FP (tax-incl)",
                "discount_amount": 20.0,
                "account_id": self.special_discount_account.id,
            })
        )
        invoice = self._create_invoice(
            self._line_vals(
                name="Line A",
                product=self.product_a,
                price_unit=500.0,
                tax=self.tax_incl,
            ),
        )
        wizard = self._create_wizard(invoice, privilege_id=privilege.id, apply_on="all")
        wizard.action_confirm()

        line = invoice.invoice_line_ids
        self.assertEqual(line.discount, 20.0)
        self.assertEqual(line.tax_ids, self.tax_incl)
        self.assertAlmostEqual(line.l10n_ph_special_discount_amount, 100.0, places=2)
        self._assert_discount_allocation(invoice, line, 100.0)

    def test_special_discount_amount_on_tax_inclusive_line(self):
        invoice = self._create_invoice(
            self._line_vals(
                name="Line A",
                product=self.product_a,
                price_unit=700.0,
                tax=self.tax_incl,
            ),
        )
        wizard = self._create_wizard(
            invoice,
            privilege_id=self.privilege.id,
            apply_on="all",
        )
        wizard.action_confirm()

        line = invoice.invoice_line_ids
        self.assertAlmostEqual(line.l10n_ph_special_discount_amount, 125.0, places=2)
        self.assertAlmostEqual(line.price_subtotal, 500.0, places=2)
        self.assertAlmostEqual(line.price_total, 500.0, places=2)
        self.assertAlmostEqual(invoice.amount_untaxed, 500.0, places=2)
        self.assertAlmostEqual(invoice.amount_total, 500.0, places=2)
        self._assert_discount_allocation(invoice, line, 125.0)

    def test_fp_privilege_on_standard_vat_with_document_tax_included(self):
        invoice = self.env["account.move"].create({
            "move_type": "out_invoice",
            "partner_id": self.partner_a.id,
            "document_tax_mode": "tax_included",
            "invoice_line_ids": [
                Command.create(
                    self._line_vals(
                        name="Line A",
                        product=self.product_a,
                        price_unit=750.0,
                        tax=self.tax_sale_12,
                    ),
                ),
            ],
        })
        wizard = self._create_wizard(
            invoice,
            privilege_id=self.privilege.id,
            apply_on="all",
        )
        wizard.action_confirm()

        line = invoice.invoice_line_ids
        self.assertAlmostEqual(line.price_unit, 669.64, places=2)
        self.assertEqual(line.discount, 20.0)
        self.assertAlmostEqual(line.l10n_ph_special_discount_amount, 133.93, places=2)
        self.assertAlmostEqual(line.price_subtotal, 535.71, places=2)
        self.assertAlmostEqual(line.price_total, 535.71, places=2)
        self.assertAlmostEqual(invoice.amount_untaxed, 535.71, places=2)
        self.assertAlmostEqual(invoice.amount_total, 535.71, places=2)
        self._assert_discount_allocation(invoice, line, 133.93)

    def test_fp_privilege_on_standard_vat_with_document_tax_excluded(self):
        invoice = self.env["account.move"].create({
            "move_type": "out_invoice",
            "partner_id": self.partner_a.id,
            "document_tax_mode": "tax_excluded",
            "invoice_line_ids": [
                Command.create(
                    self._line_vals(
                        name="Line A",
                        product=self.product_a,
                        price_unit=1000.0,
                        tax=self.tax_sale_12,
                    ),
                ),
            ],
        })
        wizard = self._create_wizard(
            invoice,
            privilege_id=self.privilege.id,
            apply_on="all",
        )
        wizard.action_confirm()

        line = invoice.invoice_line_ids
        self.assertAlmostEqual(line.price_unit, 1000.0, places=2)
        self.assertAlmostEqual(line.l10n_ph_special_discount_amount, 200.0, places=2)
        self.assertAlmostEqual(line.price_subtotal, 800.0, places=2)
        self.assertAlmostEqual(invoice.amount_total, 800.0, places=2)
        self._assert_discount_allocation(invoice, line, 200.0)

    def test_apply_vat_excl_privilege_on_vat_excl_line(self):
        privilege = (
            self.env["l10n_ph.discount.privilege"]
            .sudo()
            .create({
                "name": "SC 20% No FP",
                "discount_amount": 20.0,
                "account_id": self.special_discount_account.id,
            })
        )
        invoice = self._create_invoice(
            self._line_vals(name="Line A", product=self.product_a, price_unit=1000.0),
        )
        self.assertAlmostEqual(invoice.amount_untaxed, 1000.0)
        self.assertAlmostEqual(invoice.amount_total, 1120.0)

        wizard = self._create_wizard(invoice, privilege_id=privilege.id, apply_on="all")
        self.assertAlmostEqual(wizard.line_ids.discount_amount, 224.0, places=2)

        wizard.action_confirm()

        line = invoice.invoice_line_ids
        self.assertEqual(line.tax_ids, self.tax_sale_12)
        self.assertAlmostEqual(line.price_unit, 1000.0, places=2)
        self.assertAlmostEqual(line.l10n_ph_special_discount_amount, 224.0, places=2)
        self.assertAlmostEqual(invoice.amount_untaxed, 800.0, places=2)
        self.assertAlmostEqual(invoice.amount_total, 896.0, places=2)
        self._assert_discount_allocation(invoice, line, 224.0)

    def test_vat_able_privilege_on_vat_inclusive_line(self):
        privilege = (
            self.env["l10n_ph.discount.privilege"]
            .sudo()
            .create({
                "name": "SC 5% VAT-able",
                "discount_amount": 5.0,
                "account_id": self.special_discount_account.id,
            })
        )
        invoice = self._create_invoice(
            self._line_vals(
                name="Line A",
                product=self.product_a,
                price_unit=500.0,
                tax=self.tax_incl,
            ),
        )
        wizard = self._create_wizard(invoice, privilege_id=privilege.id, apply_on="all")
        wizard.action_confirm()

        line = invoice.invoice_line_ids
        self.assertAlmostEqual(line.l10n_ph_special_discount_amount, 25.0, places=2)
        self.assertEqual(line.discount, 5.0)
        self.assertEqual(line.tax_ids, self.tax_incl)
        self._assert_discount_allocation(invoice, line, 25.0)

    def test_vat_able_privilege_on_vat_exclusive_line(self):
        privilege = (
            self.env["l10n_ph.discount.privilege"]
            .sudo()
            .create({
                "name": "SC 5% VAT-able",
                "discount_amount": 5.0,
                "account_id": self.special_discount_account.id,
            })
        )
        invoice = self._create_invoice(
            self._line_vals(
                name="Line A",
                product=self.product_a,
                price_unit=500.0,
                tax=self.base_tax,
            ),
        )
        wizard = self._create_wizard(invoice, privilege_id=privilege.id, apply_on="all")
        wizard.action_confirm()

        line = invoice.invoice_line_ids
        self.assertAlmostEqual(line.l10n_ph_special_discount_amount, 28.0, places=2)
        self.assertEqual(line.discount, 5.0)
        self.assertEqual(line.tax_ids, self.base_tax)
        self._assert_discount_allocation(invoice, line, 28.0)

    # ============================================================
    #  Remove Operations — single line and bulk
    # ============================================================

    def test_remove_line_discount_does_not_require_privilege(self):
        invoice = self._create_invoice(
            self._line_vals(
                name="Line A",
                product=self.product_a,
                price_unit=100.0,
                discount=20.0,
                l10n_ph_discount_privilege_id=self.privilege.id,
            ),
        )
        wizard = self._create_wizard(invoice)
        self.assertFalse(wizard.privilege_id)

        line_wizard = wizard.line_ids
        line_wizard.action_remove_line_discount()
        self.assertEqual(invoice.invoice_line_ids.discount, 0.0)
        self.assertFalse(invoice.invoice_line_ids.l10n_ph_discount_privilege_id)

        self.assertEqual(
            wizard.action_confirm(),
            {"type": "ir.actions.act_window_close"},
        )

    def test_remove_line_restores_previous_discount(self):
        invoice = self._create_invoice(
            self._line_vals(
                name="Line A",
                product=self.product_a,
                price_unit=100.0,
                discount=10.0,
            ),
        )
        wizard = self._create_wizard(
            invoice,
            privilege_id=self.privilege.id,
            apply_on="all",
        )
        wizard.action_confirm()
        self.assertEqual(invoice.invoice_line_ids.discount, 20.0)

        wizard2 = self._create_wizard(invoice)
        wizard2.line_ids.action_remove_line_discount()
        self.assertFalse(invoice.invoice_line_ids.l10n_ph_discount_privilege_id)
        self.assertEqual(invoice.invoice_line_ids.discount, 10.0)

    def test_remove_all_restores_original_taxes(self):
        invoice = self._create_invoice(
            self._line_vals(name="Line A", product=self.product_a, price_unit=100.0),
        )
        wizard = self._create_wizard(
            invoice,
            privilege_id=self.privilege.id,
            apply_on="all",
        )
        wizard.action_confirm()
        self.assertEqual(invoice.invoice_line_ids.tax_ids, self.tax_sale_0_exempt_sc_pwd)
        self.assertTrue(
            invoice.line_ids.filtered(
                lambda line_item: line_item.display_type == "discount",
            ),
        )

        wizard.action_remove_all()
        self.assertEqual(invoice.invoice_line_ids.tax_ids, self.tax_sale_12)
        self.assertFalse(invoice.invoice_line_ids.l10n_ph_discount_privilege_id)
        self.assertFalse(
            invoice.line_ids.filtered(
                lambda line_item: line_item.display_type == "discount",
            ),
        )
        self.assertAlmostEqual(invoice.amount_total, 112.0)

    def test_remove_all_restores_original_discount(self):
        invoice = self._create_invoice(
            self._line_vals(
                name="Line A",
                product=self.product_a,
                price_unit=100.0,
                discount=10.0,
            ),
        )
        wizard = self._create_wizard(
            invoice,
            privilege_id=self.privilege.id,
            apply_on="all",
        )
        wizard.action_confirm()
        self.assertEqual(invoice.invoice_line_ids.discount, 20.0)

        wizard.action_remove_all()
        self.assertFalse(invoice.invoice_line_ids.l10n_ph_discount_privilege_id)
        self.assertEqual(invoice.invoice_line_ids.discount, 10.0)

    def test_remove_vat_excl_privilege_restores_state(self):
        privilege = (
            self.env["l10n_ph.discount.privilege"]
            .sudo()
            .create({
                "name": "SC 20% No FP (remove test)",
                "discount_amount": 20.0,
                "account_id": self.special_discount_account.id,
            })
        )
        invoice = self._create_invoice(
            self._line_vals(name="Line A", product=self.product_a, price_unit=1000.0),
        )
        wizard = self._create_wizard(invoice, privilege_id=privilege.id, apply_on="all")
        wizard.action_confirm()

        wizard.action_remove_all()
        line = invoice.invoice_line_ids
        self.assertEqual(line.tax_ids, self.tax_sale_12)
        self.assertAlmostEqual(line.price_unit, 1000.0, places=2)
        self.assertAlmostEqual(invoice.amount_untaxed, 1000.0, places=2)
        self.assertAlmostEqual(invoice.amount_total, 1120.0, places=2)

    # ============================================================
    #  Re-apply / Idempotency
    # ============================================================

    def test_reapply_different_privilege(self):
        invoice = self._create_invoice(
            self._line_vals(
                name="Line A",
                product=self.product_a,
                price_unit=100.0,
                discount=10.0,
            ),
        )
        wizard = self._create_wizard(
            invoice,
            privilege_id=self.privilege.id,
            apply_on="all",
        )
        wizard.action_confirm()
        line = invoice.invoice_line_ids
        self.assertEqual(line.discount, 20.0)
        self.assertEqual(line.l10n_ph_original_discount, 10.0)

        wizard2 = self._create_wizard(
            invoice,
            privilege_id=self.privilege_without_tax.id,
            apply_on="all",
        )
        wizard2.action_confirm()
        self.assertEqual(line.l10n_ph_discount_privilege_id, self.privilege_without_tax)
        self.assertEqual(line.discount, 20.0)
        self.assertEqual(line.l10n_ph_original_discount, 10.0)

        wizard2.action_remove_all()
        self.assertFalse(line.l10n_ph_discount_privilege_id)
        self.assertEqual(line.discount, 10.0)

    def test_reapply_same_privilege_is_idempotent(self):
        invoice = self._create_invoice(
            self._line_vals(
                name="Line A",
                product=self.product_a,
                price_unit=100.0,
                discount=10.0,
            ),
        )
        wizard = self._create_wizard(
            invoice,
            privilege_id=self.privilege.id,
            apply_on="all",
        )
        wizard.action_confirm()

        wizard2 = self._create_wizard(
            invoice,
            privilege_id=self.privilege.id,
            apply_on="all",
        )
        wizard2.action_confirm()

        line = invoice.invoice_line_ids
        self.assertEqual(line.l10n_ph_discount_privilege_id, self.privilege)
        self.assertEqual(line.discount, 20.0)
        self.assertEqual(line.l10n_ph_original_discount, 10.0)

    def test_wizard_mixed_privileged_and_unprivileged_lines_reapply(self):
        invoice = self._create_invoice(
            self._line_vals(name="Line A", product=self.product_a, price_unit=100.0),
            self._line_vals(name="Line B", product=self.product_b, price_unit=200.0),
        )
        wizard = self._create_wizard(
            invoice,
            privilege_id=self.privilege.id,
            apply_on="product",
            product_ids=[Command.set([self.product_a.id])],
        )
        wizard.action_confirm()

        line_a, line_b = invoice.invoice_line_ids.sorted("sequence")
        self.assertTrue(line_a.l10n_ph_discount_privilege_id)
        self.assertFalse(line_b.l10n_ph_discount_privilege_id)

        wizard2 = self._create_wizard(
            invoice,
            privilege_id=self.privilege.id,
            apply_on="all",
        )
        wizard2.action_confirm()

        line_a, line_b = invoice.invoice_line_ids.sorted("sequence")
        self.assertTrue(line_a.l10n_ph_discount_privilege_id)
        self.assertTrue(line_b.l10n_ph_discount_privilege_id)
        self.assertEqual(line_a.discount, 20.0)
        self.assertEqual(line_b.discount, 20.0)

    # ============================================================
    #  Preview Edge Cases
    # ============================================================

    def test_preview_100_percent_discount(self):
        invoice = self._create_invoice(
            self._line_vals(name="Line A", product=self.product_a, price_unit=100.0),
        )
        full = self.env["l10n_ph.discount.privilege"].sudo().create({
            "name": "Full 100%",
            "discount_amount": 100.0,
            "account_id": self.special_discount_account.id,
        })
        wizard = self._create_wizard(invoice, privilege_id=full.id, apply_on="all")
        line_wiz = wizard.line_ids
        self.assertTrue(line_wiz.has_discount_privilege)
        self.assertEqual(line_wiz.discount, 100.0)
        self.assertAlmostEqual(line_wiz.discount_amount, 112.0, places=2)

    def test_preview_line_already_has_privilege(self):
        invoice = self._create_invoice(
            self._line_vals(name="Line A", product=self.product_a, price_unit=100.0),
        )
        wizard = self._create_wizard(invoice, privilege_id=self.privilege.id, apply_on="all")
        wizard.action_confirm()

        wizard2 = self._create_wizard(invoice)
        line_wiz = wizard2.line_ids
        self.assertTrue(line_wiz.has_applied_discount_privilege)
        self.assertEqual(line_wiz.discount, 20.0)
        self.assertAlmostEqual(line_wiz.discount_amount, 20.0, places=2)

    def test_preview_different_privilege_shows_projected_amount(self):
        invoice = self._create_invoice(
            self._line_vals(name="Line A", product=self.product_a, price_unit=100.0),
        )
        wizard = self._create_wizard(invoice, privilege_id=self.privilege.id, apply_on="all")
        wizard.action_confirm()

        priv30 = self.env["l10n_ph.discount.privilege"].sudo().create({
            "name": "30% Priv",
            "discount_amount": 30.0,
            "account_id": self.special_discount_account.id,
        })
        wizard2 = self._create_wizard(invoice, privilege_id=priv30.id, apply_on="all")
        line_wiz = wizard2.line_ids
        self.assertTrue(line_wiz.has_applied_discount_privilege)
        self.assertEqual(line_wiz.discount, 30.0)
        self.assertAlmostEqual(line_wiz.discount_amount, 30.0, places=2)

    # ============================================================
    #  Section / Note Lines
    # ============================================================

    def test_skip_discount_amounts_on_section_lines(self):
        invoice = self.env["account.move"].create({
            "move_type": "out_invoice",
            "partner_id": self.partner_a.id,
            "invoice_line_ids": [
                Command.create({"name": "Section Title", "display_type": "line_section"}),
                Command.create(self._line_vals(name="Line A", product=self.product_a, price_unit=100.0)),
                Command.create({"name": "Note", "display_type": "line_note"}),
            ],
        })
        wizard = self._create_wizard(invoice, privilege_id=self.privilege.id, apply_on="all")
        wizard.action_confirm()

        section = invoice.line_ids.filtered(lambda line: line.display_type == "line_section")
        note = invoice.line_ids.filtered(lambda line: line.display_type == "line_note")
        product_line = invoice.invoice_line_ids.filtered(lambda line: line.display_type == "product")

        self.assertEqual(section.l10n_ph_special_discount_amount, 0.0)
        self.assertEqual(section.l10n_ph_regular_discount_amount, 0.0)
        self.assertEqual(note.l10n_ph_special_discount_amount, 0.0)
        self.assertEqual(note.l10n_ph_regular_discount_amount, 0.0)
        self.assertAlmostEqual(product_line.l10n_ph_special_discount_amount, 20.0, places=2)

    # ============================================================
    #  Quantity / Credit Notes / Copy
    # ============================================================

    def test_apply_with_quantity_greater_than_one(self):
        invoice = self._create_invoice(
            self._line_vals(
                name="Line A",
                product=self.product_a,
                price_unit=100.0,
                quantity=3.0,
            ),
        )
        wizard = self._create_wizard(
            invoice,
            privilege_id=self.privilege.id,
            apply_on="all",
        )
        wizard.action_confirm()

        line = invoice.invoice_line_ids
        self.assertAlmostEqual(line.l10n_ph_special_discount_amount, 60.0)
        self.assertAlmostEqual(line.price_subtotal, 240.0)

    def test_apply_on_credit_note(self):
        credit_note = self.env["account.move"].create({
            "move_type": "out_refund",
            "partner_id": self.partner_a.id,
            "invoice_line_ids": [
                Command.create(self._line_vals(name="Refund Line", price_unit=100.0)),
            ],
        })
        wizard = self._create_wizard(
            credit_note,
            privilege_id=self.privilege.id,
            apply_on="all",
        )
        wizard.action_confirm()

        line = credit_note.invoice_line_ids
        self.assertEqual(line.l10n_ph_discount_privilege_id, self.privilege)
        self.assertEqual(line.discount, 20.0)
        self.assertEqual(line.tax_ids, self.tax_sale_0_exempt_sc_pwd)
        self.assertAlmostEqual(line.l10n_ph_special_discount_amount, 20.0)

    def test_copy_invoice_copies_privilege(self):
        invoice = self._create_invoice(
            self._line_vals(name="Line A", product=self.product_a, price_unit=100.0),
        )
        wizard = self._create_wizard(
            invoice,
            privilege_id=self.privilege.id,
            apply_on="all",
        )
        wizard.action_confirm()
        self.assertTrue(invoice.invoice_line_ids.l10n_ph_discount_privilege_id)
        orig_line = invoice.invoice_line_ids

        copied = invoice.copy()
        line = copied.invoice_line_ids
        self.assertEqual(line.l10n_ph_discount_privilege_id, orig_line.l10n_ph_discount_privilege_id)
        self.assertEqual(line.l10n_ph_original_discount, orig_line.l10n_ph_original_discount)

        remove_wizard = self.env["l10n_ph.discount.privilege.wizard"].create({
            "move_id": copied.id,
        })
        remove_wizard.action_remove_all()
        self.assertFalse(line.l10n_ph_discount_privilege_id)
        self.assertEqual(line.discount, orig_line.l10n_ph_original_discount)

    # ============================================================
    #  100 % Discount
    # ============================================================

    def test_apply_full_discount_100_percent(self):
        invoice = self._create_invoice(
            self._line_vals(name="Line A", product=self.product_a, price_unit=100.0),
        )
        full = (
            self.env["l10n_ph.discount.privilege"]
            .sudo()
            .create({
                "name": "Full Discount",
                "discount_amount": 100.0,
                "account_id": self.special_discount_account.id,
            })
        )
        wizard = self._create_wizard(invoice, privilege_id=full.id, apply_on="all")
        wizard.action_confirm()
        line = invoice.invoice_line_ids
        self.assertEqual(line.discount, 100.0)
        self.assertAlmostEqual(line.price_subtotal, 0.0)
        self.assertAlmostEqual(line.l10n_ph_special_discount_amount, 112.0)
        self._assert_discount_allocation(invoice, line, 112.0)

    def test_100_percent_discount_back_calculation_tax_incl(self):
        invoice = self._create_invoice(
            self._line_vals(
                name="Line A",
                product=self.product_a,
                price_unit=500.0,
                tax=self.tax_incl,
            ),
        )
        full = self.env["l10n_ph.discount.privilege"].sudo().create({
            "name": "Full 100%",
            "discount_amount": 100.0,
            "account_id": self.special_discount_account.id,
        })
        wizard = self._create_wizard(invoice, privilege_id=full.id, apply_on="all")
        wizard.action_confirm()

        line = invoice.invoice_line_ids
        self.assertEqual(line.discount, 100.0)
        self.assertAlmostEqual(line.price_subtotal, 0.0)
        self.assertAlmostEqual(line.price_total, 0.0)
        self.assertAlmostEqual(line.l10n_ph_special_discount_amount, 500.0, places=2)

    def test_100_percent_discount_back_calculation_tax_excl(self):
        invoice = self._create_invoice(
            self._line_vals(
                name="Line A",
                product=self.product_a,
                price_unit=500.0,
                tax=self.base_tax,
            ),
        )
        full = self.env["l10n_ph.discount.privilege"].sudo().create({
            "name": "Full 100%",
            "discount_amount": 100.0,
            "account_id": self.special_discount_account.id,
        })
        wizard = self._create_wizard(invoice, privilege_id=full.id, apply_on="all")
        wizard.action_confirm()

        line = invoice.invoice_line_ids
        self.assertEqual(line.discount, 100.0)
        self.assertAlmostEqual(line.price_subtotal, 0.0)
        self.assertAlmostEqual(line.l10n_ph_special_discount_amount, 560.0, places=2)

    # ============================================================
    #  Discount Allocation Entries
    # ============================================================

    def test_apply_creates_discount_allocation_entries(self):
        invoice = self._create_invoice(
            self._line_vals(name="Line A", product=self.product_a, price_unit=100.0),
        )
        wizard = self._create_wizard(
            invoice,
            privilege_id=self.privilege.id,
            apply_on="all",
        )
        wizard.action_confirm()
        self._assert_discount_allocation(invoice, invoice.invoice_line_ids, 20.0)

    def test_apply_privilege_clears_regular_discount(self):
        regular_discount_account = self.company_data["default_account_revenue"].copy({
            "name": "Regular Discount Allocation Account",
        })
        self.company_data["company"].account_discount_expense_allocation_id = regular_discount_account
        self.addCleanup(
            lambda: self.company_data["company"].write(
                {"account_discount_expense_allocation_id": False},
            ),
        )

        invoice = self._create_invoice(
            self._line_vals(
                name="Line A",
                product=self.product_a,
                price_unit=100.0,
                discount=10.0,
            ),
        )
        wizard = self._create_wizard(
            invoice,
            privilege_id=self.privilege_without_tax.id,
            apply_on="all",
        )
        wizard.action_confirm()

        line = invoice.invoice_line_ids
        self.assertEqual(line.discount, 20.0)
        self.assertAlmostEqual(line.l10n_ph_regular_discount_amount, 0.0)
        self.assertAlmostEqual(line.l10n_ph_special_discount_amount, 22.4)
        self.assertAlmostEqual(line.price_subtotal, 80.0)
        self.assertAlmostEqual(line.price_total, 89.6)
        self._assert_discount_allocation(invoice, line, 22.4)

    # ============================================================
    #  Multi-Company / Access / Security
    # ============================================================

    def test_discount_privilege_records_are_hidden_outside_ph_company(self):
        other_company = self.env["res.company"].create({
            "name": "Non-PH Company",
            "country_id": self.env.ref("base.us").id,
        })
        privilege = (
            self.env["l10n_ph.discount.privilege"]
            .sudo()
            .create({
                "name": "PH Only",
                "discount_amount": 10.0,
                "account_id": self.special_discount_account.id,
            })
        )
        self.assertTrue(
            self.env["l10n_ph.discount.privilege"].search([("id", "=", privilege.id)]),
        )
        self.assertFalse(
            self.env["l10n_ph.discount.privilege"]
            .with_context(allowed_company_ids=other_company.ids)
            .search([("id", "=", privilege.id)]),
        )

    def test_invoicing_user_can_apply_but_not_configure_privileges(self):
        invoice_user = self.env["res.users"].create({
            "name": "Invoice User",
            "login": "invoice.user@example.com",
            "email": "invoice.user@example.com",
            "company_id": self.company_data["company"].id,
            "company_ids": [Command.set(self.company_data["company"].ids)],
            "group_ids": [
                Command.link(self.env.ref("account.group_account_invoice").id),
            ],
        })
        readonly_user = self.env["res.users"].create({
            "name": "Readonly User",
            "login": "readonly.user@example.com",
            "email": "readonly.user@example.com",
            "company_id": self.company_data["company"].id,
            "company_ids": [Command.set(self.company_data["company"].ids)],
            "group_ids": [
                Command.link(self.env.ref("account.group_account_readonly").id),
            ],
        })

        invoice = self._create_invoice(
            self._line_vals(name="Line A", product=self.product_a, price_unit=100.0),
        )
        wizard = (
            self.env["l10n_ph.discount.privilege.wizard"]
            .with_user(invoice_user)
            .with_context(
                active_id=invoice.id,
                active_ids=[invoice.id],
                active_model="account.move",
            )
            .create({"move_id": invoice.id})
        )
        self.assertEqual(wizard.move_id, invoice)

        self.env["l10n_ph.discount.privilege"].with_user(invoice_user).create({
            "name": "Invoice User Creates",
            "discount_amount": 10.0,
            "account_id": self.special_discount_account.id,
            "company_id": self.company_data["company"].id,
        })

        with self.assertRaises(Exception):
            self.env["l10n_ph.discount.privilege"].with_user(readonly_user).create({
                "name": "Should Not Create",
                "discount_amount": 10.0,
                "account_id": self.special_discount_account.id,
                "company_id": self.company_data["company"].id,
            })

    def test_wizard_rejects_privilege_from_other_company(self):
        company_b = self.env["res.company"].create({
            "name": "Company B",
            "country_id": self.env.ref("base.ph").id,
        })
        company_b.partner_id.l10n_ph_entity_type = "corporation"
        account_b = self.env["account.account"].create({
            "code": "DISC-B",
            "name": "Discount B",
            "account_type": "income",
            "company_ids": [Command.set(company_b.ids)],
        })
        priv_b = self.env["l10n_ph.discount.privilege"].sudo().create({
            "name": "Priv B",
            "discount_amount": 20.0,
            "account_id": account_b.id,
            "company_id": company_b.id,
        })

        invoice = self._create_invoice(
            self._line_vals(name="Line A", product=self.product_a, price_unit=100.0),
        )
        wizard = self._create_wizard(invoice, privilege_id=priv_b.id, apply_on="all")

        with self.assertRaises(UserError):
            wizard.action_confirm()

    # ============================================================
    #  Onchange Behavior
    # ============================================================

    def test_onchange_privilege_prefills_category_scope(self):
        invoice = self._create_invoice(
            self._line_vals(name="Line A", product=self.product_a, price_unit=100.0),
        )
        wizard = self._create_wizard(invoice)
        wizard.privilege_id = self.privilege_with_categories
        wizard._onchange_privilege_id()
        self.assertEqual(wizard.apply_on, "product_category")
        self.assertEqual(wizard.category_ids, self.category_a)

    def test_wizard_onchange_privilege_without_matching_categories(self):
        cat_x = self.env["product.category"].create({"name": "Cat X"})
        self.env["product.product"].create({"name": "Prod X", "categ_id": cat_x.id})
        cat_y = self.env["product.category"].create({"name": "Cat Y"})
        prod_y = self.env["product.product"].create({"name": "Prod Y", "categ_id": cat_y.id})

        priv = self.env["l10n_ph.discount.privilege"].sudo().create({
            "name": "Cat X Only",
            "discount_amount": 15.0,
            "account_id": self.special_discount_account.id,
            "applied_to_category_ids": [Command.set(cat_x.ids)],
        })

        invoice = self._create_invoice(
            self._line_vals(name="Line Y", product=prod_y, price_unit=100.0),
        )
        wizard = self._create_wizard(invoice)
        wizard.privilege_id = priv
        wizard._onchange_privilege_id()
        self.assertEqual(wizard.apply_on, "all")
        self.assertFalse(wizard.category_ids)

    # ============================================================
    #  Edge Cases — posted invoices, vendor bills, mixed basket
    # ============================================================

    def test_cannot_apply_on_posted_invoice(self):
        invoice = self._create_invoice(
            self._line_vals(name="Line A", product=self.product_a, price_unit=100.0),
        )
        invoice.action_post()

        wizard = self._create_wizard(
            invoice,
            privilege_id=self.privilege.id,
            apply_on="all",
        )
        with self.assertRaises(UserError):
            wizard.action_confirm()

    def test_cannot_remove_on_posted_invoice(self):
        invoice = self._create_invoice(
            self._line_vals(name="Line A", product=self.product_a, price_unit=100.0),
        )
        wizard = self._create_wizard(
            invoice,
            privilege_id=self.privilege.id,
            apply_on="all",
        )
        wizard.action_confirm()
        invoice.action_post()

        with self.assertRaises(UserError):
            wizard.action_remove_all()

    def test_privilege_not_applied_on_vendor_bill(self):
        bill = self.env["account.move"].create({
            "move_type": "in_invoice",
            "partner_id": self.partner_a.id,
            "invoice_line_ids": [
                Command.create({
                    "name": "Vendor Line",
                    "product_id": self.product_a.id,
                    "account_id": self.company_data["default_account_expense"].id,
                    "quantity": 1.0,
                    "price_unit": 100.0,
                }),
            ],
        })
        self.assertFalse(bill.l10n_ph_has_discount_privilege)

    def test_mixed_basket_multiple_privileges(self):
        pwd_privilege = (
            self.env["l10n_ph.discount.privilege"]
            .sudo()
            .create({
                "name": "PWD 20%",
                "discount_amount": 20.0,
                "fiscal_position_id": self.fpos_sc_pwd.id,
                "account_id": self.special_discount_account.id,
            })
        )
        sc5_privilege = (
            self.env["l10n_ph.discount.privilege"]
            .sudo()
            .create({
                "name": "SC 5% VAT-able",
                "discount_amount": 5.0,
                "account_id": self.special_discount_account.id,
            })
        )

        product_c = self.env["product.product"].create({"name": "Product C", "list_price": 300.0})
        product_d = self.env["product.product"].create({"name": "Product D", "list_price": 150.0})

        invoice = self._create_invoice(
            self._line_vals(name="Line A (SC 20%)", product=self.product_a, price_unit=1000.0),
            self._line_vals(name="Line B (PWD 20%)", product=self.product_b, price_unit=2000.0),
            self._line_vals(name="Line C (SC 5%)", product=product_c, price_unit=3000.0),
            self._line_vals(name="Line D (none)", product=product_d, price_unit=4000.0),
        )

        lines = invoice.invoice_line_ids.sorted("sequence")
        line_a, line_b, line_c, line_d = lines

        self._create_wizard(
            invoice,
            privilege_id=self.privilege.id,
            apply_on="product",
            product_ids=[Command.set([self.product_a.id])],
        ).action_confirm()

        self._create_wizard(
            invoice,
            privilege_id=pwd_privilege.id,
            apply_on="product",
            product_ids=[Command.set([self.product_b.id])],
        ).action_confirm()

        self._create_wizard(
            invoice,
            privilege_id=sc5_privilege.id,
            apply_on="product",
            product_ids=[Command.set([product_c.id])],
        ).action_confirm()

        self.assertEqual(line_a.l10n_ph_discount_privilege_id, self.privilege)
        self.assertEqual(line_a.discount, 20.0)
        self.assertAlmostEqual(line_a.l10n_ph_special_discount_amount, 200.0, places=2)

        self.assertEqual(line_b.l10n_ph_discount_privilege_id, pwd_privilege)
        self.assertEqual(line_b.discount, 20.0)
        self.assertAlmostEqual(line_b.l10n_ph_special_discount_amount, 400.0, places=2)

        self.assertEqual(line_c.l10n_ph_discount_privilege_id, sc5_privilege)
        self.assertEqual(line_c.discount, 5.0)
        self.assertAlmostEqual(line_c.l10n_ph_special_discount_amount, 168.0, places=2)

        self.assertFalse(line_d.l10n_ph_discount_privilege_id)
        self.assertEqual(line_d.discount, 0.0)
        self.assertEqual(line_d.tax_ids, self.base_tax)
        self.assertAlmostEqual(line_d.l10n_ph_special_discount_amount, 0.0)

        self.assertAlmostEqual(invoice.amount_total, 10072.0, places=2)
