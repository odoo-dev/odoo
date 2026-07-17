# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.fields import Command
from odoo.tests import tagged

from odoo.addons.sale.tests.common import SaleCommon


@tagged('post_install', '-at_install')
class TestSaleOrderComboLinkedLines(SaleCommon):
    """Ensure the batched _get_linked_lines_by_line returns the expected
    linked lines for both the DB (linked_line_id) and the in-memory
    (linked_virtual_id) cases.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        combo_item_products = (
            cls._create_product(name="Combo item A")
            + cls._create_product(name="Combo item B")
        )
        cls.combos = cls.env['product.combo'].create([
            {'name': "Combo A", 'combo_item_ids': [Command.create({'product_id': combo_item_products[0].id})]},
            {'name': "Combo B", 'combo_item_ids': [Command.create({'product_id': combo_item_products[1].id})]},
        ])
        cls.combo_product = cls._create_product(
            name="Meal Menu",
            type='combo',
            combo_ids=[Command.set(cls.combos.ids)],
        )

    def test_get_linked_lines_via_linked_line_id(self):
        """Combo item lines saved in DB are linked through linked_line_id."""
        order = self.empty_order
        combo_line = self.env['sale.order.line'].create({
            'order_id': order.id,
            'product_id': self.combo_product.id,
        })
        item_lines = self.env['sale.order.line'].create([{
            'order_id': order.id,
            'product_id': combo.combo_item_ids.product_id.id,
            'combo_item_id': combo.combo_item_ids.id,
            'linked_line_id': combo_line.id,
        } for combo in self.combos])

        self.assertEqual(order.order_line._get_linked_lines_by_line()[combo_line], item_lines)

    def test_get_linked_lines_via_linked_virtual_id(self):
        """Not-yet-saved combo item lines are linked through linked_virtual_id."""
        order = self.empty_order
        combo_line = self.env['sale.order.line'].create({
            'order_id': order.id,
            'product_id': self.combo_product.id,
            'virtual_id': 'combo-line',
        })
        item_lines = self.env['sale.order.line'].create([{
            'order_id': order.id,
            'product_id': combo.combo_item_ids.product_id.id,
            'combo_item_id': combo.combo_item_ids.id,
            'linked_virtual_id': 'combo-line',
        } for combo in self.combos])

        self.assertEqual(order.order_line._get_linked_lines_by_line()[combo_line], item_lines)
