# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.fields import Command
from odoo.tests import tagged

from odoo.addons.product.tests.common import ProductVariantsCommon
from odoo.addons.sale.tests.common import SaleCommon


@tagged("post_install", "-at_install")
class TestSaleVariantUom(ProductVariantsCommon, SaleCommon):
    _test_user_groups = (
        "product.group_product_manager",
        "sales_team.group_sale_manager",  # FIXME: use sales_team.group_sale_salesman
    )

    _test_user_name = "Test Sales & Product Manager"

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.template = cls.env["product.template"].create({
            "name": "Water",
            "uom_id": cls.uom_unit.id,
            "attribute_line_ids": [Command.create({
                "attribute_id": cls.size_attribute.id,
                "value_ids": [Command.set([cls.size_attribute_s.id, cls.size_attribute_m.id])],
            })],
        })
        cls.variant_unit, cls.variant_pack = cls.template.product_variant_ids.sorted("id")
        cls.variant_pack.uom_id = cls.uom_pack_6

    def test_order_line_uses_the_variant_unit(self):
        self._enable_uom()
        order = self.env["sale.order"].create({
            "partner_id": self.partner.id,
            "order_line": [Command.create({"product_id": self.variant_pack.id})],
        })
        line = order.order_line
        self.assertEqual(line.product_uom_id, self.uom_pack_6)
        self.assertEqual(line.allowed_uom_ids, self.uom_pack_6 | self.uom_unit, "Its template unit is available too")

        line.product_id = self.variant_unit
        self.assertEqual(line.product_uom_id, self.uom_unit)

    def test_sales_count_in_the_template_unit(self):
        order = self.env["sale.order"].create({
            "partner_id": self.partner.id,
            "order_line": [
                Command.create({"product_id": self.variant_unit.id, "product_uom_qty": 3}),
                Command.create({"product_id": self.variant_pack.id, "product_uom_qty": 2}),
            ],
        })
        order.action_confirm()
        order.order_line.flush_recordset()
        self.assertEqual(self.variant_pack.sales_count, 2)
        self.assertEqual(self.template.sales_count, 15)
