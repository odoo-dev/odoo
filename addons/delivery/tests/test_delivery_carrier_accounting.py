# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.fields import Command
from odoo.tests import Form, tagged

from odoo.addons.sale.tests.common import TestSaleCommon


@tagged("post_install", "-at_install")
class TestDeliveryCarrierAccounting(TestSaleCommon):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env["delivery.carrier"].search([]).action_archive()
        cls.company = cls.company_data["company"]
        cls.carrier = cls._create_carrier()

    @classmethod
    def _create_carrier(cls, **values):
        return cls.env["delivery.carrier"].create({
            "name": "Test Carrier",
            "delivery_type": "fixed",
            "fixed_price": 10.0,
            **values,
        })

    def _create_order_with_delivery(self, carrier, **values):
        order = self.env["sale.order"].create({
            "partner_id": self.partner_a.id,
            "order_line": [Command.create({"product_id": self.product_a.id, "price_unit": 100.0})],
            **values,
        })
        wizard = Form(
            self.env["choose.delivery.carrier"].with_context(
                default_order_id=order.id, default_carrier_id=carrier.id
            )
        ).save()
        wizard.button_confirm()
        return order, order.order_line.filtered("is_delivery")

    def test_product_field_removed(self):
        self.assertNotIn("product_id", self.env["delivery.carrier"]._fields)

    def test_defaults_from_company_accounting_settings(self):
        self.assertTrue(self.company.income_account_id)
        self.assertTrue(self.company.expense_account_id)
        self.assertTrue(self.company.account_sale_tax_id)
        self.assertRecordValues(self.carrier, [{
            "property_account_income_id": self.company.income_account_id.id,
            "property_account_expense_id": self.company.expense_account_id.id,
            "tax_ids": self.company.account_sale_tax_id.ids,
        }])
        # The defaults are also proposed in the form view
        carrier_form = Form(self.env["delivery.carrier"])
        self.assertEqual(carrier_form.property_account_income_id, self.company.income_account_id)
        self.assertEqual(carrier_form.property_account_expense_id, self.company.expense_account_id)
        self.assertEqual(carrier_form.tax_ids[:], self.company.account_sale_tax_id)

    def test_custom_values(self):
        income_account = self.copy_account(self.company_data["default_account_revenue"])
        expense_account = self.copy_account(self.company_data["default_account_expense"])
        carrier = self._create_carrier(
            property_account_income_id=income_account.id,
            property_account_expense_id=expense_account.id,
            tax_ids=[Command.set((self.tax_sale_a + self.tax_sale_b).ids)],
        )
        self.assertRecordValues(carrier, [{
            "property_account_income_id": income_account.id,
            "property_account_expense_id": expense_account.id,
            "tax_ids": (self.tax_sale_a + self.tax_sale_b).ids,
        }])
        self.assertEqual(
            carrier._get_accounts(self.company),
            {"income": income_account, "expense": expense_account},
        )

        # Values are kept on duplication
        carrier_copy = carrier.copy()
        self.assertRecordValues(carrier_copy, [{
            "property_account_income_id": income_account.id,
            "property_account_expense_id": expense_account.id,
            "tax_ids": (self.tax_sale_a + self.tax_sale_b).ids,
        }])

    def test_accounts_fallback_on_company_defaults(self):
        self.carrier.write({
            "property_account_income_id": False,
            "property_account_expense_id": False,
        })
        self.assertEqual(
            self.carrier._get_accounts(self.company),
            {"income": self.company.income_account_id, "expense": self.company.expense_account_id},
        )

    def test_multi_company(self):
        company_2 = self.setup_other_company()["company"]
        self.assertNotEqual(company_2.income_account_id, self.company.income_account_id)

        # Default values depend on the company the carrier is created in
        carrier_2 = self.env["delivery.carrier"].with_company(company_2).create({
            "name": "Company 2 Carrier",
            "company_id": company_2.id,
        })
        self.assertRecordValues(carrier_2.with_company(company_2), [{
            "property_account_income_id": company_2.income_account_id.id,
            "property_account_expense_id": company_2.expense_account_id.id,
        }])

        # Accounts of a shared carrier are company dependent
        shared_carrier = self.carrier
        income_account_2 = self.copy_account(company_2.income_account_id)
        shared_carrier.with_company(company_2).property_account_income_id = income_account_2
        self.assertEqual(
            shared_carrier.with_company(self.company).property_account_income_id,
            self.company.income_account_id,
        )
        self.assertEqual(
            shared_carrier.with_company(company_2).property_account_income_id, income_account_2
        )
        self.assertEqual(shared_carrier._get_accounts(company_2)["income"], income_account_2)
        self.assertEqual(
            shared_carrier._get_accounts(company_2)["expense"], company_2.expense_account_id
        )

        # Only the taxes of the company are used
        shared_carrier.tax_ids += company_2.account_sale_tax_id
        self.assertEqual(
            shared_carrier._get_taxes(self.company), self.company.account_sale_tax_id
        )
        self.assertEqual(shared_carrier._get_taxes(company_2), company_2.account_sale_tax_id)

    def test_no_default_sale_tax(self):
        self.company.account_sale_tax_id = False
        carrier = self._create_carrier()
        self.assertFalse(carrier.tax_ids)

        _order, delivery_line = self._create_order_with_delivery(carrier)
        self.assertRecordValues(delivery_line, [{
            "product_id": False,
            "tax_ids": [],
            "price_unit": 10.0,
            "price_total": 10.0,
        }])

    def test_delivery_line_without_product(self):
        self.carrier.tax_ids = self.tax_sale_a + self.tax_sale_b
        order, delivery_line = self._create_order_with_delivery(self.carrier)
        self.assertRecordValues(delivery_line, [{
            "name": self.carrier.name,
            "product_id": False,
            "product_uom_id": self.uom_unit.id,
            "product_uom_qty": 1.0,
            "price_unit": 10.0,
            "tax_ids": (self.tax_sale_a + self.tax_sale_b).ids,
        }])

        # Recomputing the taxes keeps the taxes of the delivery method
        delivery_line._compute_tax_ids()
        self.assertEqual(delivery_line.tax_ids, self.tax_sale_a + self.tax_sale_b)

        # Fiscal positions are applied on the taxes of the delivery method
        tax_mapped = self.tax_sale_a.copy({"name": "Mapped tax"})
        fiscal_position = self.env["account.fiscal.position"].create({"name": "FP"})
        tax_mapped.write({
            "fiscal_position_ids": [Command.set(fiscal_position.ids)],
            "original_tax_ids": [Command.set(self.tax_sale_a.ids)],
        })
        order.fiscal_position_id = fiscal_position
        order._recompute_taxes()
        self.assertEqual(
            delivery_line.tax_ids, fiscal_position.map_tax(self.tax_sale_a + self.tax_sale_b)
        )
        self.assertIn(tax_mapped, delivery_line.tax_ids)

    def test_invoice_delivery_line(self):
        """The delivery line is invoiced on ordered quantity, on the income account of the delivery
        method."""
        self.company.sale_invoice_policy = "delivery"
        income_account = self.copy_account(self.company_data["default_account_revenue"])
        self.carrier.property_account_income_id = income_account

        order, delivery_line = self._create_order_with_delivery(self.carrier)
        order.action_confirm()
        self.assertEqual(delivery_line.invoice_policy, "order")
        self.assertEqual(delivery_line.qty_to_invoice, 1.0)
        self.assertIn(
            delivery_line,
            self.env["sale.order.line"].search([
                ("order_id", "=", order.id), ("invoice_policy", "=", "order")
            ]),
        )
        self.assertNotIn(
            delivery_line,
            self.env["sale.order.line"].search([
                ("order_id", "=", order.id), ("invoice_policy", "=", "delivery")
            ]),
        )

        # Deliver the product so that the order can be invoiced
        order.order_line.filtered(lambda line: not line.is_delivery).qty_delivered = 1
        invoice = order._create_invoices()
        invoice_line = invoice.invoice_line_ids.filtered(
            lambda line: line.sale_line_ids == delivery_line
        )
        self.assertRecordValues(invoice_line, [{
            "product_id": False,
            "account_id": income_account.id,
            "quantity": 1.0,
            "price_unit": 10.0,
            "tax_ids": delivery_line.tax_ids.ids,
        }])

    def test_invoice_delivery_line_with_fiscal_position(self):
        mapped_account = self.copy_account(self.company.income_account_id)
        fiscal_position = self.env["account.fiscal.position"].create({
            "name": "FP",
            "account_ids": [Command.create({
                "account_src_id": self.company.income_account_id.id,
                "account_dest_id": mapped_account.id,
            })],
        })
        order, _delivery_line = self._create_order_with_delivery(
            self.carrier, fiscal_position_id=fiscal_position.id
        )
        order.action_confirm()
        invoice = order._create_invoices()
        delivery_invoice_line = invoice.invoice_line_ids.filtered(
            lambda line: line.sale_line_ids.is_delivery
        )
        self.assertEqual(delivery_invoice_line.account_id, mapped_account)
