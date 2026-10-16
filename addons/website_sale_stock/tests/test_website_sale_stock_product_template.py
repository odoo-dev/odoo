# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime
from unittest.mock import patch

from odoo.fields import Command
from odoo.tests import HttpCase, tagged

from odoo.addons.website_sale_stock.tests.common import WebsiteSaleStockCommon


@tagged("post_install", "-at_install")
class TestWebsiteSaleStockProductTemplate(HttpCase, WebsiteSaleStockCommon):
    _test_user_groups = (
        'base.group_user',
        'product.group_product_manager',
        'sales_team.group_sale_manager',  # FIXME: use sales_team.group_sale_salesman
    )

    _test_user_name = 'Test Sales & Product Manager'

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.product_oos_order_allowed = cls._create_product(
            is_storable=True, allow_out_of_stock_order=True
        )
        cls.product_oos_order_not_allowed = cls._create_product(
            is_storable=True, allow_out_of_stock_order=False
        )

    def test_website_sale_stock_get_additional_configurator_data(self):
        product = self.product_oos_order_not_allowed
        self.env["stock.quant"].sudo().create({
            "product_id": product.id,
            "location_id": self.warehouse.lot_stock_id.id,
            "quantity": 10,
        })

        with self.mock_request() as request:
            configurator_data = request.env["product.template"]._get_additional_configurator_data(
                product_or_template=product,
                date=datetime(2000, 1, 1),
                currency=self.currency,
                pricelist=self.env["product.pricelist"],
            )

        self.assertEqual(configurator_data["free_qty"], 10)

    def test_get_additional_combination_info_max_combo_quantity_with_max(self):
        product_a = self.product_oos_order_not_allowed
        product_b = self._create_product(is_storable=True, allow_out_of_stock_order=False)
        product_c = self.product_oos_order_allowed
        self.env["stock.quant"].sudo().create([
            {
                "product_id": product_a.id,
                "location_id": self.warehouse.lot_stock_id.id,
                "quantity": 5,
            },
            {
                "product_id": product_b.id,
                "location_id": self.warehouse.lot_stock_id.id,
                "quantity": 10,
            },
        ])
        combo_a, combo_b, combo_c = self.env["product.combo"].create([
            {"name": "Combo A", "combo_item_ids": [Command.create({"product_id": product_a.id})]},
            {"name": "Combo B", "combo_item_ids": [Command.create({"product_id": product_b.id})]},
            {"name": "Combo C", "combo_item_ids": [Command.create({"product_id": product_c.id})]},
        ])
        combo_product = self._create_product(
            type="combo",
            combo_ids=[
                Command.link(combo_a.id),
                Command.link(combo_b.id),
                Command.link(combo_c.id),
            ],
        )
        self.cart.order_line = [Command.create({"product_id": product_a.id, "product_uom_qty": 3})]

        with self.mock_request(sale_order_id=self.cart.id) as request:
            combination_info = (
                self
                .env["product.template"]
                .with_context(website_sale_product_page=True)
                ._get_additional_combination_info(
                    combo_product,
                    quantity=3,
                    uom=combo_product.uom_id,
                    website=self.website,
                    pricelist=request.pricelist,
                    fiscal_position=request.fiscal_position,
                )
            )

        self.assertEqual(combination_info["max_combo_quantity"], 2)

    def test_get_additional_combination_info_max_combo_quantity_without_max(self):
        product = self.product_oos_order_allowed
        combo = self.env["product.combo"].create({
            "name": "Test combo",
            "combo_item_ids": [Command.create({"product_id": product.id})],
        })
        combo_product = self._create_product(type="combo", combo_ids=[Command.link(combo.id)])

        with self.mock_request(sale_order_id=self.cart.id) as request:
            combination_info = (
                self
                .env["product.template"]
                .with_context(website_sale_product_page=True)
                ._get_additional_combination_info(
                    combo_product,
                    quantity=3,
                    uom=combo_product.uom_id,
                    website=self.website,
                    pricelist=request.pricelist,
                    fiscal_position=request.fiscal_position,
                )
            )

        self.assertNotIn("max_combo_quantity", combination_info)

    def test_get_additional_combination_info_free_quantity_is_integer(self):
        self._add_product_qty_to_wh(
            self.product_oos_order_not_allowed.id, 9, self.warehouse.lot_stock_id.id
        )
        with self.mock_request(sale_order_id=self.cart.id) as request:
            combination_info = (
                self
                .env["product.template"]
                .with_context(website_sale_product_page=True)
                ._get_additional_combination_info(
                    self.product_oos_order_not_allowed,
                    quantity=9,
                    uom=self.env.ref("uom.product_uom_pack_6"),
                    website=self.website,
                    pricelist=request.pricelist,
                    fiscal_position=request.fiscal_position,
                )
            )
        self.assertEqual(combination_info["free_qty"], 1)

    def test_filter_sold_out(self):
        """Only the storable products that can't be sold out of stock are checked."""
        in_stock = self._create_product(is_storable=True, allow_out_of_stock_order=False)
        self._add_product_qty_to_wh(in_stock.id, 5, self.warehouse.lot_stock_id.id)
        sold_out = self._create_product(is_storable=True, allow_out_of_stock_order=False)
        not_storable = self._create_product(is_storable=False)
        templates = (
            self.product_oos_order_allowed
            + self.product_oos_order_not_allowed
            + in_stock
            + not_storable
            + sold_out
        ).product_tmpl_id

        ProductTemplate = self.env.registry["product.template"]
        is_sold_out = ProductTemplate._is_sold_out
        checked = self.env["product.template"]

        def spy(template):
            nonlocal checked
            checked |= template
            return is_sold_out(template)

        with self.mock_request() as request, patch.object(ProductTemplate, "_is_sold_out", spy):
            templates = templates.with_env(request.env)
            self.assertEqual(
                templates._filter_sold_out(),
                (self.product_oos_order_not_allowed + sold_out).product_tmpl_id,
            )
            self.assertEqual(
                checked, (self.product_oos_order_not_allowed + in_stock + sold_out).product_tmpl_id
            )
            self.assertEqual(
                templates._filter_sold_out(limit=1),
                self.product_oos_order_not_allowed.product_tmpl_id,
            )

    def test_shop_in_stock_filter(self):
        self.env["product.ribbon"].create({"name": "Out of stock", "assign": "out_of_stock"})
        in_stock = self._create_product(
            name="Stockfilter In Stock", is_storable=True, allow_out_of_stock_order=False
        )
        self._add_product_qty_to_wh(in_stock.id, 5, self.warehouse.lot_stock_id.id)
        sold_out = self._create_product(
            name="Stockfilter Sold Out", is_storable=True, allow_out_of_stock_order=False
        )
        names = {in_stock.name, sold_out.name}

        def shop(**params):
            response = self.url_open("/shop", params={"search": "Stockfilter", **params})
            response.raise_for_status()
            return (
                {name for name in names if name in response.text},
                'aria-label="Filter by in stock products"' in response.text,
            )

        self.assertEqual(shop(), (names, True))
        self.assertEqual(shop(in_stock=1), ({in_stock.name}, True))

        self._add_product_qty_to_wh(sold_out.id, 5, self.warehouse.lot_stock_id.id)
        self.assertEqual(shop(), (names, False))
