# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.addons.stock.tests.common import TestStockCommon


class TestPackaging(TestStockCommon):
    """ Packages: put in pack, package propagation, and negative-quant
    reconciliation.
    """

    _test_user_groups = ('stock.group_stock_user',)

    # ---- Put in pack ----

    def test_put_in_pack_splits_partially_picked_line_into_separate_packages(self):
        """ Calling `action_put_in_pack()` on a partially-picked move packs
        the picked portion and splits off a fresh, unpacked line for what's
        left - calling it again for that remainder packs it into a
        different package, not the same one. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 2)
        delivery = self._deliver(moves=[(self.product, 2)], validate=False)
        delivery.action_confirm()
        delivery.action_assign()
        self._check_inventory(self.product, {self.stock_location: 0})

        delivery.move_ids.quantity = 1
        delivery.action_put_in_pack()
        delivery.action_assign()

        self._check_inventory(self.product, {self.stock_location: 0})
        self.assertEqual(len(delivery.move_line_ids), 2)
        remaining_line = delivery.move_line_ids.filtered(lambda ml: not ml.result_package_id)
        self.assertEqual(remaining_line.quantity_product_uom, 1)

        remaining_line.quantity = 1
        delivery.action_put_in_pack()

        self.assertEqual(len(delivery.move_line_ids), 2)
        self.assertNotEqual(delivery.move_line_ids[0].result_package_id, delivery.move_line_ids[1].result_package_id)
        self._check_inventory(self.product, {self.stock_location: 0})

        delivery.move_ids.picked = True
        delivery.button_validate()

        self._check_inventory(self.product, {self.stock_location: 0, self.customer_location: 2})

    def test_put_in_pack_packs_multiple_reserved_lines_together_in_one_call(self):
        """ A single `action_put_in_pack()` call packs every reserved-but-
        unpicked line on the picking into the same package, even across
        different products/moves. """
        other_product = self._create_product(name='Other Product')
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 1)
        self.env['stock.quant']._update_available_quantity(other_product, self.stock_location, 2)
        delivery = self._deliver(moves=[(self.product, 1), (other_product, 2)], validate=False)
        delivery.action_confirm()
        delivery.action_assign()
        self._check_inventory(self.product, {self.stock_location: 0})
        self._check_inventory(other_product, {self.stock_location: 0})

        delivery.action_put_in_pack()

        self.assertEqual(len(delivery.move_line_ids), 2)
        line_product = delivery.move_line_ids.filtered(lambda ml: ml.product_id == self.product)
        line_other = delivery.move_line_ids.filtered(lambda ml: ml.product_id == other_product)
        self.assertEqual(line_product.quantity, 1)
        self.assertEqual(line_other.quantity, 2)
        self.assertEqual(line_product.result_package_id, line_other.result_package_id)

    def test_put_in_pack_separate_calls_use_separate_packages(self):
        """ Packing each product with its own `action_put_in_pack()` call -
        instead of one call covering both - lands them in different
        packages. """
        other_product = self._create_product(name='Other Product')
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 1)
        self.env['stock.quant']._update_available_quantity(other_product, self.stock_location, 2)
        delivery = self._deliver(moves=[(self.product, 1), (other_product, 2)], validate=False)
        delivery.action_confirm()
        delivery.action_assign()
        self._check_inventory(self.product, {self.stock_location: 0})
        self._check_inventory(other_product, {self.stock_location: 0})
        line_product = delivery.move_line_ids.filtered(lambda ml: ml.product_id == self.product)
        line_other = delivery.move_line_ids.filtered(lambda ml: ml.product_id == other_product)

        line_product.quantity = 1
        line_product.picked = True
        delivery.action_put_in_pack()
        line_other.quantity = 2
        line_other.picked = True
        delivery.action_put_in_pack()

        self.assertEqual(len(delivery.move_line_ids), 2)
        self.assertNotEqual(line_product.result_package_id, line_other.result_package_id)
