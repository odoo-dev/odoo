# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime

from lxml import html

from odoo.fields import Command, Date
from odoo.tests import tagged

from odoo.addons.website_sale.tests.common import WebsiteSaleCommon


@tagged("post_install", "-at_install")
class TestWebsiteSaleProductTemplate(WebsiteSaleCommon):
    _test_user_groups = (
        'base.group_user',
        'product.group_product_manager',
        'sales_team.group_sale_manager',  # FIXME: use sales_team.group_sale_salesman
        'website.group_website_designer',  # website config (currency_id, restricted_uom_ids, ...)
    )

    _test_user_name = 'Test Sales & Product Manager'

    def test_website_sale_get_configurator_display_price(self):
        self.website.show_line_subtotals_tax_selection = "tax_included"
        tax = self.env["account.tax"].sudo().create({"name": "Test tax", "amount": 10})
        product = self._create_product(list_price=100, taxes_id=[Command.link(tax.id)])

        with self.mock_request() as request:
            configurator_price = request.env["product.template"]._get_configurator_display_price(
                product_or_template=product,
                quantity=3,
                date=datetime(2000, 1, 1),
                currency=self.currency,
                pricelist=self.env["product.pricelist"],
            )

        self.assertEqual(configurator_price[0], 110)

    def test_markup_data_uses_group_schema_when_multiple_variants(self):
        product_attribute = self.env["product.attribute"].create({
            "name": "Test attribute",
            "create_variant": "always",
            "value_ids": [
                Command.create({"name": "Test value 1"}),
                Command.create({"name": "Test value 2"}),
            ],
        })
        product_template = self.env["product.template"].create({
            "name": "Test product",
            "attribute_line_ids": [
                Command.create({
                    "attribute_id": product_attribute.id,
                    "value_ids": [Command.set(product_attribute.value_ids.ids)],
                })
            ],
        })
        with self.mock_request():
            markup_data = product_template.with_context(
                website_id=self.website.id
            )._prepare_jsonld_vals()
        self.assertEqual(markup_data["@type"], "ProductGroup")
        self.assertEqual(len(markup_data["hasVariant"]), 2)

    def test_markup_data_uses_product_schema_when_single_variant(self):
        product_template = self.env["product.template"].create({"name": "Test product"})
        with self.mock_request():
            markup_data = product_template.with_context(
                website_id=self.website.id
            )._prepare_jsonld_vals()
        self.assertEqual(markup_data["@type"], "Product")

    def test_markup_data_uses_taxes_excluded_price_when_configured_on_website(self):
        self.env["res.config.settings"].sudo().create({
            "show_line_subtotals_tax_selection": "tax_excluded"
        }).execute()
        with self.mock_request() as request:
            markup_data = self.product.with_context(request.env.context)._prepare_jsonld_vals()
            self.assertEqual(
                markup_data["offers"]["price"],
                request.env.website.currency_id.round(self.product.base_unit_price),
            )

    def test_markup_data_uses_taxes_included_price_when_configured_on_website(self):
        self.env["res.config.settings"].sudo().create({
            "show_line_subtotals_tax_selection": "tax_included"
        }).execute()
        self.product.price_extra = 10
        with self.mock_request():
            product_tmpl = self.product.product_tmpl_id
            markup_data = self.product.with_context(
                website_id=self.website.id
            )._prepare_jsonld_vals()
            self.assertEqual(
                markup_data["offers"]["price"],
                self.website.currency_id.round(
                    self.product.base_unit_price * (1 + product_tmpl.taxes_id[0].amount / 100)
                ),
            )

    def test_markup_data_converts_price_to_website_currency(self):
        company_currency = self.env.company.currency_id
        # Find a currency different from the company currency.
        self.website.currency_id = (
            self
            .env["res.currency"]
            .with_context(active_test=False)
            .search([("name", "!=", company_currency.name)], limit=1)
        )
        with self.mock_request():
            markup = self.product.with_context(website_id=self.website.id)._prepare_jsonld_vals()
        # Expected converted price
        expected_price = company_currency._convert(
            self.product.list_price,
            self.website.currency_id,
            company=self.env.company,
            date=Date.from_string("2020-01-01"),
        )
        self.assertAlmostEqual(markup["offers"]["price"], expected_price, places=2)

    def test_remove_archived_products_from_cart(self):
        """Archived products shouldn't appear in carts."""
        self.product.action_archive()
        self.assertNotIn(
            self.product,
            self.cart.order_line.product_id,
            "Archived product should be deleted from the cart.",
        )
        self.service_product.product_tmpl_id.action_archive()
        self.assertNotIn(
            self.service_product,
            self.cart.order_line.product_id,
            "All products from archived product templates should be removed from the cart.",
        )

    def test_get_additional_combination_info_converts_price_to_website_currency(self):
        company_currency = self.env.company.currency_id
        # Find a currency different from the company currency.
        self.website.currency_id = (
            self
            .env["res.currency"]
            .with_context(active_test=False)
            .search([("name", "!=", company_currency.name)], limit=1)
        )
        with self.mock_request() as request:
            result = self.env["product.template"]._get_additional_combination_info(
                self.product,
                1.0,
                self.product.uom_id,
                self.website,
                request.pricelist,
                request.fiscal_position,
            )
        # Expected converted price
        expected_price = company_currency._convert(
            self.product.list_price, self.website.currency_id, company=self.env.company
        )
        self.assertAlmostEqual(result["price"], expected_price, places=2)

    def test_get_available_uoms_no_restrictions(self):
        self._enable_uom()
        template = self.product.product_tmpl_id
        template.uom_ids = [self.uom_dozen.id, self.uom_ton.id]

        uoms = template.with_context({"website_id": self.website.id})._get_available_uoms()

        self.assertEqual(len(uoms), 3)

    def test_get_available_uoms_restricted_additional_uom(self):
        self._enable_uom()
        template = self.product.product_tmpl_id
        template.uom_ids = [self.uom_dozen.id, self.uom_ton.id]
        self.website.restricted_uom_ids = [self.uom_dozen.id]

        uoms = template.with_context({"website_id": self.website.id})._get_available_uoms()

        self.assertEqual(len(uoms), 2)
        self.assertTrue(self.uom_dozen not in uoms)

    def test_has_multiple_uoms_restricted_main_uom(self):
        self._enable_uom()
        template = self.product.product_tmpl_id
        template.uom_ids = [self.uom_dozen.id]
        self.website.restricted_uom_ids = [template.uom_id.id]

        result = template.with_context({"website_id": self.website.id})._has_multiple_uoms()
        uoms = template.with_context({"website_id": self.website.id})._get_available_uoms()
        main_uom = template.with_context({"website_id": self.website.id})._get_main_uom()

        self.assertEqual(len(uoms), 1)
        self.assertTrue(result)
        self.assertEqual(main_uom, self.uom_dozen)

    def test_has_multiple_uoms_restricted_additional_uom(self):
        self._enable_uom()
        template = self.product.product_tmpl_id
        template.uom_ids = [self.uom_dozen.id]
        self.website.restricted_uom_ids = [self.uom_dozen.id]

        result = template.with_context({"website_id": self.website.id})._has_multiple_uoms()
        uoms = template.with_context({"website_id": self.website.id})._get_available_uoms()
        main_uom = template.with_context({"website_id": self.website.id})._get_main_uom()

        self.assertEqual(len(uoms), 1)
        self.assertFalse(result)
        self.assertEqual(main_uom, template.uom_id)

    def test_base_unit_count_supports_high_precision_values(self):
        base_unit = self.env["product.base.unit"].create({"name": "box of 10000"})
        product = self._create_product(
            name="Screws", list_price=1.0, base_unit_count=0.0001, base_unit_id=base_unit.id
        )
        product_template = product.product_tmpl_id

        self.assertEqual(product.fields_get(["base_unit_count"])["base_unit_count"]["digits"], 0)
        self.assertEqual(
            product_template.fields_get(["base_unit_count"])["base_unit_count"]["digits"], 0
        )
        self.assertEqual(product.base_unit_count, 0.0001)
        self.assertEqual(product_template.base_unit_count, 0.0001)
        self.assertEqual(product.base_unit_price, 10000.0)
        self.assertEqual(product_template.base_unit_price, 10000.0)

    def test_markup_data_has_no_offer_when_price_is_hidden(self):
        self.website.prevent_sale = True
        self.product.list_price = 0
        with self.mock_request() as request:
            markup_data = self.product.with_context(request.env.context)._prepare_jsonld_vals()
        self.assertNotIn("offers", markup_data)

    def test_markup_data_has_offer_for_priced_product_in_restricted_category(self):
        """The sale of the product is prevented by its category, but its price is still shown."""
        category = self._create_public_category([{"name": "Restricted"}])
        self.website.write({
            "prevent_sale": True,
            "prevent_sale_for": "specific_categories",
            "prevent_sale_for_categories": [Command.set(category.ids)],
        })
        self.product.public_categ_ids = category
        with self.mock_request() as request:
            markup_data = self.product.with_context(request.env.context)._prepare_jsonld_vals()
        self.assertIn("offers", markup_data)

    def test_product_page_pricelist_min_qty_includes_cart_qty(self):
        pricelist = self._enable_pricelists()
        pricelist.item_ids = [
            Command.create({
                "product_tmpl_id": self.product.product_tmpl_id.id,
                "compute_price": "discount",
                "price_discount": 50.0,
                "min_quantity": 6.0,
            }),
        ]
        with self.mock_request(
            sale_order_id=self.cart.id, website_sale_current_pl=pricelist.id
        ) as request:
            template = request.env["product.template"].browse(self.product.product_tmpl_id.id)
            product_page_info = template.with_context(
                website_sale_product_page=True
            )._get_combination_info(product_id=self.product.id, add_qty=1)
            self.assertEqual(product_page_info["price"], self.product.list_price / 2)

    def test_variant_specific_uom_product_page(self):
        """The product page of a variant uses the unit of this variant."""
        self._enable_uom()
        attribute = self.env["product.attribute"].create({
            "name": "Packaging",
            "value_ids": [Command.create({"name": "Single"}), Command.create({"name": "Pack"})],
        })
        template = self.env["product.template"].create({
            "name": "Water",
            "list_price": 10,
            "uom_id": self.uom_unit.id,
            "uom_ids": [Command.link(self.uom_dozen.id)],
            "attribute_line_ids": [Command.create({
                "attribute_id": attribute.id,
                "value_ids": [Command.set(attribute.value_ids.ids)],
            })],
        })
        variant_single, variant_pack = template.product_variant_ids.sorted("id")
        variant_pack.uom_id = self.uom_pack_6
        # Only sold by the single variant
        box_of_10 = self.env["uom.uom"].create({
            "name": "Box of 10", "relative_factor": 10, "relative_uom_id": self.uom_unit.id,
        })
        variant_single.extra_uom_ids = box_of_10

        with self.mock_request(user=self.env.user) as request:
            template = template.with_env(request.env)
            variant_pack = variant_pack.with_env(request.env)
            combination_info = template._get_combination_info(product_id=variant_pack.id)
            # Switching from the other variant carries its selected unit over
            carried_unit_info = template._get_combination_info(
                product_id=variant_pack.id, uom_id=box_of_10.id,
            )
            unit_info = template._get_combination_info(product_id=variant_pack.id, uom_id=self.uom_unit.id)
            dozen_info = template._get_combination_info(product_id=variant_pack.id, uom_id=self.uom_dozen.id)
            selector = request.env["ir.ui.view"]._render_template(
                "website_sale.product_packaging_selector",
                values={
                    "product": template,
                    "product_variant": variant_pack,
                    "combination_info": combination_info,
                },
            )
        self.assertEqual(combination_info["price"], 10, "The price should be the one of a pack")
        self.assertEqual(carried_unit_info["price"], 10, "Box of 10 isn't available for this variant")
        self.assertAlmostEqual(unit_info["price"], 10 / 6, places=2, msg="Its template unit is available too")
        self.assertEqual(dozen_info["price"], 20, "An available unit is still respected: a dozen is 2 packs")
        checked_uoms = html.fromstring(str(selector)).xpath("//input[@name='uom_id' and @checked]")
        self.assertEqual([uom.get("id") for uom in checked_uoms], [f"uom-{self.uom_pack_6.id}"])

    def test_packaging_selector_selects_the_priced_unit(self):
        """The unit selected on the product page is always the one used for the displayed price."""
        self._enable_uom()
        attribute = self.env["product.attribute"].create({
            "name": "Packaging",
            "value_ids": [Command.create({"name": "Single"}), Command.create({"name": "Pack"})],
        })
        template = self.env["product.template"].create({
            "name": "Water",
            "list_price": 12,
            "uom_id": self.uom_unit.id,
            "attribute_line_ids": [Command.create({
                "attribute_id": attribute.id,
                "value_ids": [Command.set(attribute.value_ids.ids)],
            })],
        })
        variant_pack = template.product_variant_ids.sorted("id")[1]
        variant_pack.uom_id = self.uom_pack_6
        variant_pack.extra_uom_ids = self.uom_unit

        def get_price_and_selected_uom(**kwargs):
            with self.mock_request(user=self.env.user) as request:
                combination_info = template.with_env(request.env)._get_combination_info(
                    product_id=variant_pack.id, **kwargs,
                )
                selector = request.env["ir.ui.view"]._render_template(
                    "website_sale.product_packaging_selector",
                    values={
                        "product": template.with_env(request.env),
                        "product_variant": variant_pack.with_env(request.env),
                        "combination_info": combination_info,
                    },
                )
            checked_uoms = html.fromstring(str(selector)).xpath("//input[@name='uom_id' and @checked]")
            return combination_info["price"], [uom.get("id") for uom in checked_uoms]

        pack_id, unit_id = f"uom-{self.uom_pack_6.id}", f"uom-{self.uom_unit.id}"
        self.assertEqual(get_price_and_selected_uom(), (12, [pack_id]), "The variant unit is the default one")
        self.assertEqual(
            get_price_and_selected_uom(uom_id=self.uom_unit.id), (2, [unit_id]),
            "A unit carried over from another variant is kept when this variant also sells it",
        )
        self.assertEqual(
            get_price_and_selected_uom(uom_id=self.uom_dozen.id), (12, [pack_id]),
            "A unit carried over from another variant is replaced when this variant doesn't sell it",
        )
