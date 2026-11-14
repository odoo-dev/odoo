# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.fields import Command
from odoo.tests import tagged

from odoo.addons.sale.tests.common import TestSaleCommon


@tagged("post_install", "-at_install")
class TestDeliveryCarrierAccounting(TestSaleCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.company = cls.company_data["company"]
        cls.tax_sale = cls.company_data["default_tax_sale"]
        cls.revenue_account = cls.company_data["default_account_revenue"]
        cls.expense_account = cls.company_data["default_account_expense"]
        cls.shipping_account = cls.revenue_account.copy({"code": "700999", "name": "Shipping"})

        cls.carrier = cls.env["delivery.carrier"].create({
            "name": "Carrier",
            "delivery_type": "fixed",
            "fixed_price": 10.0,
        })
        cls.product = cls.company_data["product_order_no"]

    def _create_order(self, **values):
        return self.env["sale.order"].create({
            "partner_id": self.partner_a.id,
            "order_line": [Command.create({"product_id": self.product.id, "price_unit": 100.0})],
            **values,
        })

    def _add_delivery(self, order, carrier=None):
        carrier = carrier or self.carrier
        order.set_delivery_line(carrier, carrier.rate_shipment(order)["price"])
        return order.order_line.filtered("is_delivery")

    def test_carrier_defaults_from_accounting_settings(self):
        """A new carrier takes the default sales tax of the company and falls back on the default
        income and expense accounts of the company."""
        self.assertEqual(self.carrier.tax_ids, self.tax_sale)
        self.assertFalse(self.carrier.income_account_id)
        self.assertFalse(self.carrier.expense_account_id)
        accounts = self.carrier._get_delivery_accounts(self.company)
        self.assertEqual(accounts["income"], self.company.income_account_id)
        self.assertEqual(accounts["expense"], self.company.expense_account_id)

        self.carrier.income_account_id = self.shipping_account
        self.assertEqual(
            self.carrier._get_delivery_accounts(self.company)["income"], self.shipping_account
        )

    def test_carrier_currency(self):
        main_company = self.env["res.company"]._get_main_company()
        self.assertEqual(self.carrier.currency_id, main_company.currency_id)
        self.carrier.company_id = self.company
        self.assertEqual(self.carrier.currency_id, self.company.currency_id)

    def test_delivery_line_without_product(self):
        order = self._create_order()
        delivery_line = self._add_delivery(order)

        self.assertEqual(len(delivery_line), 1)
        self.assertFalse(delivery_line.product_id)
        self.assertEqual(delivery_line.name, self.carrier.name)
        self.assertEqual(delivery_line.product_uom_id, self.env.ref("uom.product_uom_unit"))
        self.assertEqual(delivery_line.price_unit, 10.0)
        self.assertEqual(delivery_line.tax_ids, self.tax_sale)
        self.assertEqual(delivery_line.invoice_policy, "order")

    def test_delivery_line_taxes_mapped_by_fiscal_position(self):
        fiscal_position = self.env["account.fiscal.position"].create({"name": "Export"})
        export_tax = self.tax_sale.copy({
            "name": "Export tax",
            "amount": 0.0,
            "fiscal_position_ids": [Command.set(fiscal_position.ids)],
            "original_tax_ids": [Command.set(self.tax_sale.ids)],
        })
        order = self._create_order(fiscal_position_id=fiscal_position.id)

        delivery_line = self._add_delivery(order)

        self.assertEqual(delivery_line.tax_ids, export_tax)

    def test_delivery_line_without_tax(self):
        self.carrier.tax_ids = [Command.clear()]
        order = self._create_order()

        delivery_line = self._add_delivery(order)

        self.assertFalse(delivery_line.tax_ids)

    def test_rate_with_price_included_tax_and_fiscal_position(self):
        """The rate of a carrier whose tax is price-included is adapted to the mapped taxes."""
        tax_included = self.env["account.tax"].create({
            "name": "21% included",
            "amount": 21.0,
            "price_include_override": "tax_included",
        })
        fiscal_position = self.env["account.fiscal.position"].create({"name": "Export"})
        self.env["account.tax"].create({
            "name": "0% export",
            "amount": 0.0,
            "fiscal_position_ids": [Command.set(fiscal_position.ids)],
            "original_tax_ids": [Command.set(tax_included.ids)],
        })
        self.carrier.write({"tax_ids": [Command.set(tax_included.ids)], "fixed_price": 121.0})

        order = self._create_order()
        self.assertAlmostEqual(self.carrier.rate_shipment(order)["price"], 121.0)
        order.fiscal_position_id = fiscal_position
        self.assertAlmostEqual(self.carrier.rate_shipment(order)["price"], 100.0)

    def test_invoice_line_uses_carrier_income_account(self):
        self.carrier.income_account_id = self.shipping_account
        order = self._create_order()
        self._add_delivery(order)
        order.action_confirm()

        invoice = order._create_invoices()

        delivery_aml = invoice.invoice_line_ids.filtered(lambda aml: not aml.product_id)
        self.assertEqual(delivery_aml.account_id, self.shipping_account)
        self.assertEqual(delivery_aml.tax_ids, self.tax_sale)
        self.assertEqual(delivery_aml.price_unit, 10.0)

    def test_invoice_line_falls_back_on_company_income_account(self):
        order = self._create_order()
        self._add_delivery(order)
        order.action_confirm()

        invoice = order._create_invoices()

        delivery_aml = invoice.invoice_line_ids.filtered(lambda aml: not aml.product_id)
        self.assertEqual(delivery_aml.account_id, self.company.income_account_id)

    def test_invoice_line_account_mapped_by_fiscal_position(self):
        self.carrier.income_account_id = self.shipping_account
        export_account = self.shipping_account.copy({"code": "700998", "name": "Export Shipping"})
        fiscal_position = self.env["account.fiscal.position"].create({
            "name": "Export",
            "account_ids": [Command.create({
                "account_src_id": self.shipping_account.id,
                "account_dest_id": export_account.id,
            })],
        })
        order = self._create_order(fiscal_position_id=fiscal_position.id)
        self._add_delivery(order)
        order.action_confirm()

        invoice = order._create_invoices()

        delivery_aml = invoice.invoice_line_ids.filtered(lambda aml: not aml.product_id)
        self.assertEqual(delivery_aml.account_id, export_account)

    def test_delivery_line_invoiced_with_delivered_quantities_policy(self):
        """Shipping costs are invoiced on ordered quantities whatever the company policy."""
        self.company.sale_invoice_policy = "delivery"
        order = self._create_order()
        delivery_line = self._add_delivery(order)
        order.action_confirm()

        self.assertEqual(delivery_line.invoice_policy, "order")
        self.assertEqual(delivery_line.qty_to_invoice, 1.0)
        self.assertIn(
            delivery_line,
            self.env["sale.order.line"].search([
                ("order_id", "=", order.id), ("invoice_policy", "=", "order"),
            ]),
        )
        self.assertNotIn(
            delivery_line,
            self.env["sale.order.line"].search([
                ("order_id", "=", order.id), ("invoice_policy", "=", "delivery"),
            ]),
        )

    def test_carrier_taxes_filtered_by_company(self):
        """A carrier shared between companies only applies the taxes of the order's company."""
        company_2 = self.setup_other_company()["company"]
        tax_2 = company_2.account_sale_tax_id
        self.carrier.tax_ids = [Command.set((self.tax_sale + tax_2).ids)]

        order = self._create_order()
        self.assertEqual(self._add_delivery(order).tax_ids, self.tax_sale)

        order_2 = self.env["sale.order"].with_company(company_2).create({
            "partner_id": self.partner_a.id,
            "company_id": company_2.id,
            "order_line": [Command.create({"name": "Service", "price_unit": 100.0})],
        })
        delivery_line_2 = self._add_delivery(order_2, self.carrier.with_company(company_2))
        self.assertEqual(delivery_line_2.tax_ids, tax_2)
