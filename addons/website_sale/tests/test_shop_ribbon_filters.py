# Part of Odoo. See LICENSE file for full copyright and licensing details.

from unittest.mock import patch

from odoo.fields import Command
from odoo.tests import HttpCase, tagged

from odoo.addons.website_sale.tests.common import WebsiteSaleCommon


@tagged("post_install", "-at_install")
class TestShopRibbonFilters(WebsiteSaleCommon, HttpCase):
    _test_user_groups = (
        'base.group_user',
    )

    _test_user_name = 'Test Internal User'

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env["product.ribbon"].create({"name": "Sale", "assign": "sale"})
        cls.group_user._apply_group(cls.env.ref("website_sale.group_product_price_comparison"))

        ProductTemplate = cls.env["product.template"]
        cls.plain = ProductTemplate.create({
            "name": "Ribbonfilter Plain", "list_price": 100, "website_published": True,
        })
        cls.compared = ProductTemplate.create({
            "name": "Ribbonfilter Compared",
            "list_price": 100,
            "compare_list_price": 150,
            "website_published": True,
        })
        cls.discounted = ProductTemplate.create({
            "name": "Ribbonfilter Discounted", "list_price": 100, "website_published": True,
        })
        cls.templates = cls.plain + cls.compared + cls.discounted

        cls.env["product.pricelist"].search([]).write({"sequence": 1000})
        cls.pricelist = cls._enable_pricelists()
        cls.pricelist.write({
            "sequence": 1,
            "selectable": True,
            "item_ids": [Command.create({
                "applied_on": "1_product",
                "product_tmpl_id": cls.discounted.id,
                "compute_price": "discount",
                "price_discount": 10,
            })],
        })

    def _filter_on_sale(self, templates, pricelist, limit=None):
        with self.mock_request() as request:
            return templates.with_env(request.env)._filter_on_sale(
                pricelist.sudo(), request.fiscal_position, request.env.website, limit=limit
            )

    def _shop_names(self, **params):
        """Return the names of the test templates listed by /shop, and whether the "On sale" filter
        is shown.
        """
        response = self.url_open("/shop", params={"search": "Ribbonfilter", **params})
        response.raise_for_status()
        return (
            {template.name for template in self.templates if template.name in response.text},
            'aria-label="Filter by on sale products"' in response.text,
        )

    def test_filter_on_sale(self):
        self.assertEqual(
            self._filter_on_sale(self.templates, self.pricelist),
            self.compared + self.discounted,
        )
        self.assertEqual(
            self._filter_on_sale(self.templates, self.pricelist, limit=1), self.compared
        )

    def test_filter_on_sale_only_computes_possible_discounts(self):
        """Without a discount rule in the pricelist, only the templates with a comparison price can
        be on sale: the prices of the other ones are not computed.
        """
        ProductTemplate = self.env.registry["product.template"]
        get_sales_prices = ProductTemplate._get_sales_prices
        priced = self.env["product.template"]

        def spy(templates, *args, **kwargs):
            nonlocal priced
            priced |= templates
            return get_sales_prices(templates, *args, **kwargs)

        pricelist = self._create_pricelist(name="No discount")
        with patch.object(ProductTemplate, "_get_sales_prices", spy):
            on_sale = self._filter_on_sale(self.templates, pricelist)
        self.assertEqual(on_sale, self.compared)
        self.assertEqual(priced, self.compared)

        self.group_user.sudo()._remove_group(
            self.env.ref("website_sale.group_product_price_comparison")
        )
        priced = self.env["product.template"]
        with patch.object(ProductTemplate, "_get_sales_prices", spy):
            on_sale = self._filter_on_sale(self.templates, pricelist)
        self.assertFalse(on_sale)
        self.assertFalse(priced)

    def test_shop_on_sale_filter(self):
        names, shows_filter = self._shop_names()
        self.assertEqual(names, set(self.templates.mapped("name")))
        self.assertTrue(shows_filter)

        names, shows_filter = self._shop_names(on_sale=1)
        self.assertEqual(names, {self.compared.name, self.discounted.name})
        self.assertTrue(shows_filter)

    def test_shop_on_sale_filter_hidden_without_discount(self):
        self.pricelist.item_ids.sudo().unlink()
        self.compared.sudo().compare_list_price = 0
        names, shows_filter = self._shop_names()
        self.assertEqual(names, set(self.templates.mapped("name")))
        self.assertFalse(shows_filter)
