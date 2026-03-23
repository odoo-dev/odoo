# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime

from odoo.tests import tagged, users

from odoo.addons.sale.tests.common import SaleCommon


@tagged("post_install", "-at_install")
class TestSaleProductTemplate(SaleCommon):
    @users("salesman")
    def test_sale_get_configurator_display_price(self):
        configurator_price = self.env["product.template"]._get_configurator_display_price(
            product_or_template=self._create_product(list_price=40),
            quantity=3,
            date=datetime(2000, 1, 1),
            currency=self.currency,
            pricelist=self.env["product.pricelist"],
        )

        self.assertEqual(configurator_price[0], 40)

    @users("salesman")
    def test_sale_get_additional_configurator_data(self):
        configurator_data = self.env["product.template"]._get_additional_configurator_data(
            product_or_template=self.product,
            date=datetime(2000, 1, 1),
            currency=self.currency,
            pricelist=self.env["product.pricelist"],
        )

        self.assertEqual(configurator_data, {})

    def test_create_products_in_different_companies(self):
        """Ensure the product's constrain on `company_id` doesn't block the creation of multiple
        products in different companies (see `product.template` `_check_sale_product_company`).
        """
        company_a = self.env["res.company"].create({"name": "Company A"})
        company_b = self.env["res.company"].create({"name": "Company B"})
        products = self.env["product.template"].create([
            {"name": "Product Test 1", "company_id": company_a.id},
            {"name": "Product Test 2", "company_id": company_b.id},
            {"name": "Product Test 3", "company_id": False},
        ])
        self.assertRecordValues(
            products,
            [{"company_id": company_a.id}, {"company_id": company_b.id}, {"company_id": False}],
        )
