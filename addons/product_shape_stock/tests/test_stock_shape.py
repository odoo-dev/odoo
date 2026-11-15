from odoo.tests import Form, tagged

from odoo.addons.product_shape.tests.common import ProductShapeCommon


@tagged('post_install', '-at_install')
class TestStockShape(ProductShapeCommon):
    _test_user_groups = ('product.group_product_manager', 'stock.group_stock_manager', 'stock.group_production_lot')

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.teak.write({'is_storable': True, 'tracking': 'lot'})
        cls.warehouse = cls.env['stock.warehouse'].search([('company_id', '=', cls.env.company.id)], limit=1)
        cls.stock_location = cls.warehouse.lot_stock_id

    def _receive(self, quantity, sizes):
        """Receive `quantity` cubic feet of teak as the pieces `sizes`: [(size, pcs), ...]."""
        receipt = self.env['stock.picking'].create({
            'picking_type_id': self.warehouse.in_type_id.id,
            'move_ids': [{
                'product_id': self.teak.id,
                'product_uom_qty': quantity,
                'location_id': self.warehouse.in_type_id.default_location_src_id.id,
                'location_dest_id': self.stock_location.id,
            }],
        })
        receipt.action_confirm()
        move = receipt.move_ids
        with Form(move, view='stock.view_stock_move_operations') as move_form:
            for index, (size, pcs) in enumerate(sizes):
                with (move_form.move_line_ids.edit(0) if index == 0 else move_form.move_line_ids.new()) as line:
                    for fname, value in size.items():
                        line[fname] = value
                    line.shape_pcs = pcs
        move.picked = True
        receipt.button_validate()
        return receipt

    def test_receive_pieces_by_size(self):
        receipt = self._receive(665, [
            (self.teak_size, 2),
            ({'shape_height': 7, 'shape_length': 5, 'shape_width': 7}, 1),
        ])
        self.assertRecordValues(receipt.move_line_ids, [
            {'lot_name': "6 x 5 x 7", 'shape_pcs': 2, 'quantity': 420},
            {'lot_name': "7 x 5 x 7", 'shape_pcs': 1, 'quantity': 245},
        ])
        lots = receipt.move_line_ids.lot_id
        self.assertRecordValues(lots, [
            {'name': "6 x 5 x 7", 'shape_height': 6, 'shape_length': 5, 'shape_width': 7, 'product_qty': 420, 'shape_pcs': 2},
            {'name': "7 x 5 x 7", 'shape_height': 7, 'shape_length': 5, 'shape_width': 7, 'product_qty': 245, 'shape_pcs': 1},
        ])

        # the same size again goes to its lot
        receipt = self._receive(630, [(self.teak_size, 3)])
        self.assertEqual(receipt.move_line_ids.lot_id, lots[0])
        quant = self.env['stock.quant']._gather(self.teak, self.stock_location, lot_id=lots[0])
        self.assertRecordValues(quant, [{'quantity': 1050, 'shape_pcs': 5}])
        self.assertAlmostEqual(quant.shape_weight, 1050 * 0.0283168 * 650, places=0)

    def test_issue_pieces_of_a_size(self):
        receipt = self._receive(420, [(self.teak_size, 2)])
        lot = receipt.move_line_ids.lot_id
        delivery = self.env['stock.picking'].create({
            'picking_type_id': self.warehouse.out_type_id.id,
            'move_ids': [{
                'product_id': self.teak.id,
                'product_uom_qty': 210,
                'location_id': self.stock_location.id,
                'location_dest_id': self.warehouse.out_type_id.default_location_dest_id.id,
            }],
        })
        delivery.action_confirm()
        # the reserved line has the size of its lot, and the pieces of its quantity
        self.assertRecordValues(delivery.move_line_ids, [{
            'lot_id': lot.id, 'shape_height': 6, 'shape_length': 5, 'shape_width': 7, 'shape_pcs': 1, 'quantity': 210,
        }])
        with Form(delivery.move_ids, view='stock.view_stock_move_operations') as move_form, \
                move_form.move_line_ids.edit(0) as line:
            line.shape_pcs = 2
        self.assertEqual(delivery.move_line_ids.quantity, 420)

    def test_count_pieces(self):
        receipt = self._receive(420, [(self.teak_size, 2)])
        quant = self.env['stock.quant']._gather(self.teak, self.stock_location, lot_id=receipt.move_line_ids.lot_id)
        quant = quant.with_context(inventory_mode=True)
        quant.inventory_shape_pcs = 1
        quant._onchange_inventory_shape_pcs()
        quant.action_apply_inventory()
        self.assertRecordValues(quant, [{'quantity': 210, 'shape_pcs': 1, 'inventory_shape_pcs': 0}])
