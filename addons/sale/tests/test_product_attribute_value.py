# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.fields import Command
from odoo.tests import HttpCase, tagged

from odoo.addons.sale.tests.common import SaleCommon


@tagged("post_install", "-at_install")
class TestProductAttributeValue(HttpCase, SaleCommon):
    _test_user_groups = (
        'product.group_product_manager',
        'sales_team.group_sale_manager',  # FIXME: use sales_team.group_sale_salesman
    )

    _test_user_name = 'Test Sales & Product Manager'

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.product_attribute = cls.env["product.attribute"].create({
            "name": "PA",
            "sequence": 1,
            "create_variant": "no_variant",
            "value_ids": [
                Command.create({"name": f"pa_value_{i + 1}", "sequence": i}) for i in range(3)
            ],
        })
        cls.a1, cls.a2, cls.a3 = cls.product_attribute.value_ids
        cls.product_template, cls.archived_template = cls.env["product.template"].create([
            {
                "name": "P1",
                "type": "consu",
                "attribute_line_ids": [
                    Command.create({
                        "attribute_id": cls.product_attribute.id,
                        "value_ids": [Command.set([cls.a1.id, cls.a3.id])],
                    })
                ],
            },
            {
                "name": "P2",
                "type": "consu",
                "attribute_line_ids": [
                    Command.create({
                        "attribute_id": cls.product_attribute.id,
                        "value_ids": [Command.set([cls.a1.id, cls.a2.id])],
                    })
                ],
            },
        ])
        cls.archived_template.action_archive()
        order = cls._create_so(
            order_line=[
                Command.create({
                    "product_id": cls.product_template.product_variant_id.id,
                    "product_no_variant_attribute_value_ids": [
                        Command.set(
                            cls.product_template.attribute_line_ids.product_template_value_ids.filtered(
                                lambda ptav: ptav.product_attribute_value_id.id == cls.a3.id
                            ).ids
                        )
                    ],
                })
            ]
        )
        cls.order_line = order.order_line

    def test_attribute_values_deletion_or_archiving(self):
        """Check that product attributes can be deleted if product or linked ptav are archived."""
        if self.env["ir.module.module"]._get("sale_management").state != "installed":
            self.skipTest("Sale App is not installed, Sale menu is not accessible.")

        # Make sure variants are enabled (needed for menu access)
        group_variant = self.env.ref("product.group_product_variant")
        self.group_user.sudo().implied_ids = [Command.link(group_variant.id)]

        self.product_template.attribute_line_ids.update({"value_ids": [Command.set([self.a1.id])]})
        self.assertEqual(
            self.order_line.product_no_variant_attribute_value_ids.product_attribute_value_id,
            self.a3,
        )
        self.assertFalse(self.order_line.product_no_variant_attribute_value_ids.ptav_active)
        self.start_tour("/odoo", "delete_product_attribute_value_tour", login=self.env.user.login)

    def test_sale_order_line_multiline_description_sequence(self):
        """Test that sale order line multiline description respects attribute line sequence."""
        attr_custom = self.env["product.attribute"].create({
            "name": "Custom Engraving",
            "create_variant": "no_variant",
        })
        val_custom = self.env["product.attribute.value"].create({
            "name": "Engraving Text",
            "attribute_id": attr_custom.id,
            "is_custom": True,
        })
        attr_normal = self.env["product.attribute"].create({
            "name": "Material",
            "create_variant": "no_variant",
        })
        val_normal_1 = self.env["product.attribute.value"].create({
            "name": "Steel",
            "attribute_id": attr_normal.id,
        })
        val_normal_2 = self.env["product.attribute.value"].create({
            "name": "Gold",
            "attribute_id": attr_normal.id,
        })

        product = self.env["product.template"].create({
            "name": "Customizable Product",
            "attribute_line_ids": [
                Command.create({
                    "attribute_id": attr_custom.id,
                    "value_ids": [Command.set([val_custom.id])],
                    "sequence": 1,
                }),
                Command.create({
                    "attribute_id": attr_normal.id,
                    "value_ids": [Command.set([val_normal_1.id, val_normal_2.id])],
                    "sequence": 2,
                }),
            ],
        })

        ptav_custom = product.attribute_line_ids[0].product_template_value_ids
        ptav_normal = product.attribute_line_ids[1].product_template_value_ids.filtered(
            lambda ptav: ptav.product_attribute_value_id == val_normal_1
        )

        so = self._create_so(
            order_line=[
                Command.create({
                    "product_id": product.product_variant_id.id,
                    "product_no_variant_attribute_value_ids": [
                        Command.set([ptav_custom.id, ptav_normal.id])
                    ],
                    "product_custom_attribute_value_ids": [
                        Command.create({
                            "custom_product_template_attribute_value_id": ptav_custom.id,
                            "custom_value": "My Engraving",
                        })
                    ],
                })
            ]
        )
        line = so.order_line
        description = line._get_sale_order_line_multiline_description_variants()
        self.assertEqual(
            description, "\nCustom Engraving: Engraving Text: My Engraving\nMaterial: Steel"
        )
