# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import Command

from odoo.addons.stock.tests.common import TestStockCommon


class TestReporting(TestStockCommon):
    """ Stock reporting and dashboards: forecast/stock-quantity reports and the
    inventory overview.
    """


class TestDeliverySlipReport(TestStockCommon):
    """ `stock.move.line._get_aggregated_product_quantities()` - the data
    grouping behind the delivery slip report: how it groups move lines by
    product/description/UoM, tracks ordered vs. delivered quantities across
    backorders, and its `strict`/`except_package` modes for a
    partially-packed order.
    """

    _test_user_groups = ('stock.group_stock_user',)

    def test_aggregated_quantities_group_multiple_products_with_descriptions(self):
        """ Move lines are grouped by product + description + UoM - the
        same product with and without a line description becomes two
        separate entries, not combined into one; a different product
        groups separately again, regardless of its own description.
        """
        other_product = self._create_product(name='Other Product')
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 10)
        self.env['stock.quant']._update_available_quantity(other_product, self.stock_location, 10)
        delivery = self._deliver(moves=[
            {
                'product_id': self.product.id, 'product_uom_qty': 5, 'uom_id': self.uom_unit.id,
                'location_id': self.stock_location.id, 'location_dest_id': self.customer_location.id,
            },
            {
                'product_id': self.product.id, 'product_uom_qty': 3, 'uom_id': self.uom_unit.id,
                'location_id': self.stock_location.id, 'location_dest_id': self.customer_location.id,
                'description_picking': 'Gift wrapped',
            },
            {
                'product_id': other_product.id, 'product_uom_qty': 2, 'uom_id': self.uom_unit.id,
                'location_id': self.stock_location.id, 'location_dest_id': self.customer_location.id,
            },
        ])

        aggregated = delivery.move_line_ids._get_aggregated_product_quantities()

        self.assertEqual(len(aggregated), 3)
        key_plain = f'{self.product.id}_{self.product.display_name}__{self.uom_unit.id}_{self.uom_unit.id}'
        key_described = f'{self.product.id}_{self.product.display_name}_Gift wrapped_{self.uom_unit.id}_{self.uom_unit.id}'
        key_other = f'{other_product.id}_{other_product.display_name}__{self.uom_unit.id}_{self.uom_unit.id}'
        self.assertEqual(aggregated[key_plain]['quantity'], 5)
        self.assertEqual(aggregated[key_described]['quantity'], 3)
        self.assertEqual(aggregated[key_described]['description'], 'Gift wrapped')
        self.assertEqual(aggregated[key_other]['quantity'], 2)

    def test_aggregated_quantities_reflect_undelivered_quantities_via_backorder(self):
        """ A product only partially delivered still reports its full
        ordered quantity in the aggregate - the rest is tracked via its
        backorder. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 10)
        delivery = self._deliver(moves=[(self.product, 10)], validate=False)
        delivery.action_confirm()
        delivery.action_assign()
        delivery.move_line_ids.quantity = 6
        delivery.move_ids.picked = True

        action = delivery.button_validate()
        self.assertEqual(action.get('res_model'), 'stock.backorder.confirmation')
        self._process_backorder_wizard(action)

        aggregated = delivery.move_line_ids._get_aggregated_product_quantities()
        aggregate_val = next(iter(aggregated.values()))
        self.assertEqual(aggregate_val['qty_ordered'], 10)
        self.assertEqual(aggregate_val['quantity'], 6)

    def test_aggregated_quantities_sum_across_duplicate_moves_and_split_lines(self):
        """ Two separate moves for the same product, one of them also
        over-received into a second move line, all collapse into a single
        aggregate entry.
        """
        move1 = self._create_move(self.product, self.supplier_location, self.stock_location, product_uom_qty=10)
        move2 = self._create_move(self.product, self.supplier_location, self.stock_location, product_uom_qty=5)
        (move1 | move2)._action_confirm(merge=False)

        move1.quantity = 13
        self.assertEqual(len(move1.move_line_ids), 2)
        (move1 | move2).picked = True
        (move1 | move2)._action_done()

        aggregated = (move1 | move2).move_line_ids._get_aggregated_product_quantities()
        self.assertEqual(len(aggregated), 1)
        aggregate_val = next(iter(aggregated.values()))
        self.assertEqual(aggregate_val['qty_ordered'], 15)
        self.assertEqual(aggregate_val['quantity'], 18)

    def test_aggregated_quantities_scoped_to_one_package(self):
        """ `strict=True` scopes the aggregate to one specific package at a
        time, instead of combining everything packed under that
        product. """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 25)
        delivery = self._deliver(moves=[(self.product, 15)], validate=False)
        delivery.action_confirm()
        delivery.action_assign()
        delivery.move_ids.quantity = 5
        delivery.action_put_in_pack()
        delivery.action_assign()
        unpacked_line = delivery.move_line_ids.filtered(lambda ml: not ml.result_package_id)
        unpacked_line.quantity = 10
        delivery.action_put_in_pack()
        self.assertEqual(len(delivery.move_line_ids), 2)

        delivery.move_ids.picked = True
        delivery.button_validate()

        aggregated_1 = delivery.move_line_ids[0]._get_aggregated_product_quantities(strict=True)
        aggregated_2 = delivery.move_line_ids[1]._get_aggregated_product_quantities(strict=True)
        self.assertEqual(next(iter(aggregated_1.values()))['qty_ordered'], 5)
        self.assertEqual(next(iter(aggregated_2.values()))['qty_ordered'], 10)

    def test_aggregated_quantities_modes_for_partially_packed_order(self):
        """ The three call signatures read a partially-packed order
        differently: the default aggregate still counts the full demand
        even for the not-yet-packed remainder (tracked via the backorder);
        `strict=True` scopes to just what's actually in the package;
        `except_package=True` shows only the not-yet-packed portion
        """
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 25)
        delivery = self._deliver(moves=[(self.product, 15)], validate=False)
        delivery.action_confirm()
        delivery.move_ids.quantity = 5
        delivery.move_ids.picked = True
        delivery.action_put_in_pack()
        package = delivery.move_line_ids.result_package_id

        action = delivery.button_validate()
        self._process_backorder_wizard(action)
        delivery.backorder_ids.action_cancel()

        default_aggregated = delivery.move_line_ids._get_aggregated_product_quantities()
        default_val = next(v for k, v in default_aggregated.items() if k.endswith(f'_{package.id}'))
        self.assertEqual(default_val['qty_ordered'], 15)
        self.assertEqual(default_val['quantity'], 5)

        strict_aggregated = delivery.move_line_ids._get_aggregated_product_quantities(strict=True)
        strict_val = next(iter(strict_aggregated.values()))
        self.assertEqual(strict_val['qty_ordered'], 5)
        self.assertEqual(strict_val['quantity'], 5)

        except_package_aggregated = delivery.move_line_ids._get_aggregated_product_quantities(except_package=True)
        except_val = next(iter(except_package_aggregated.values()))
        self.assertEqual(except_val['qty_ordered'], 10)
        self.assertFalse(except_val['quantity'])

    def test_aggregated_quantities_convert_to_packaging_uom(self):
        """ Move lines in plain units, across two packages, aggregate
        correctly converted into the move's own packaging UoM. """
        pack_of_6 = self.quick_ref('uom.product_uom_pack_6')
        package1, package2 = self.env['stock.package'].create([{'name': 'Pack 1'}, {'name': 'Pack 2'}])
        receipt = self._receipt(moves=[(self.product, 10, pack_of_6)], validate=False)
        self.assertEqual(receipt.move_ids.packaging_uom_id, pack_of_6)
        receipt.action_confirm()

        receipt.write({
            'move_line_ids': [
                Command.update(receipt.move_ids.move_line_ids.id, {
                    'quantity': 30, 'uom_id': self.uom_unit.id, 'result_package_id': package1.id,
                }),
                Command.create({
                    'product_id': self.product.id, 'quantity': 30, 'uom_id': self.uom_unit.id,
                    'result_package_id': package2.id,
                }),
            ],
        })

        for aggregate_val in receipt.move_line_ids._get_aggregated_product_quantities().values():
            self.assertEqual(aggregate_val['qty_ordered'], 5)
            self.assertEqual(aggregate_val['quantity'], 5)
            self.assertEqual(aggregate_val['packaging_quantity'], 5)
            self.assertEqual(aggregate_val['packaging_qty_ordered'], 5)
