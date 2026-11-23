from odoo import fields
from odoo.exceptions import UserError, ValidationError
from odoo.fields import Command, Domain
from odoo.tests import Form, tagged

from odoo.addons.stock_account.tests.common import TestStockValuationCommon

from .stock_card_report_test_data.fefo_removal_strategy_data import FEFO_REMOVAL_STRATEGY_TESTS
from .stock_card_report_test_data.inter_company_transit_data import INTER_COMPANY_TESTS
from .stock_card_report_test_data.inter_warehouse_transit_data import INTER_WAREHOUSE_TESTS
from .stock_card_report_test_data.internal_transfer_data import INTERNAL_TRANSFER_TESTS
from .stock_card_report_test_data.inventory_adjustment_data import INVENTORY_ADJUSTMENT_TESTS
from .stock_card_report_test_data.lot_not_valuated_data import LOT_NOT_VALUATED_TESTS
from .stock_card_report_test_data.lot_valuated_data import LOT_VALUATED_TESTS
from .stock_card_report_test_data.manufacturing_data import MANUFACTURING_TESTS
from .stock_card_report_test_data.receipt_delivery_data import RECEIPT_DELIVERY_TESTS
from .stock_card_report_test_data.repair_data import REPAIR_TESTS
from .stock_card_report_test_data.scrap_data import SCRAP_TESTS


@tagged('post_install', '-at_install', 'unka')
class TestStockCardBase(TestStockValuationCommon):
    """
    Test the stock card report for different inventory operations and costing methods.

    The tests should cover various inventory operations (e.g. receipts, deliveries,
    internal transfers, and manufacturing) for all three costing methods
    (standard, average, and fifo).

    To keep this test file maintainable and well-organized, this class should only
    contain test declarations. The subTest scenarios and their expected results
    should be defined in the appropriate files under the `stock_card_report_test_data`
    directory. Extend an existing data file when applicable; otherwise, create a new
    one for the operation.

    The format for defining subTests and their expected results is documented in
    `_perform_operation`.
    """
    _test_user_groups = None  # FIXME list needed groups

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.StockCardReport = cls.env['stock.card.report']
        cls.customer = cls.env['res.partner'].create({'name': 'Customer'})

        # Warehouses
        cls.warehouse_1 = cls.env['stock.warehouse'].create({  # Recipient Warehouse
            'name': 'Small Warehouse',
            'code': 'SWH'
        })

        # Locations
        cls.shelf1_location = cls.env['stock.location'].create({
            'name': 'shelf1',
            'usage': 'internal',
            'location_id': cls.stock_location.id,
        })
        cls.scrap_location = cls.warehouse.company_id.scrap_location_id

        # Uoms
        cls.uom_unit = cls.quick_ref('uom.product_uom_unit')

    # ---------------------------------------------------------
    # Helpers
    # ---------------------------------------------------------
    def _get_report_lines(self, domain=Domain.TRUE):
        """Return stock card report lines matching the given domain."""
        self.env.flush_all()
        return self.StockCardReport.search(domain, order='id')

    def _assert_report_lines(self, report_lines, result):
        """Assert that the generated stock card report lines match the expected values."""
        fields = result['fields']
        expected_lines = result['expected_lines']
        self.assertEqual(len(report_lines), len(expected_lines), "Number of report lines does not match expected lines.")
        expected_values = []
        for expected in expected_lines:
            self.assertEqual(
                len(fields),
                len(expected),
                "Number of expected values does not match the number of fields.",
            )
            expected_values.append(dict(zip(fields, expected)))
        self.assertRecordValues(report_lines, expected_values, field_names=fields)

    def _setup_multicompany_for_inter_company_transit(self):
        self.company_b = self.env['res.company'].create({
            'name': 'Company B',
            'country_id': self.env.ref('base.ph').id,
        })
        (self.company | self.company_b).write({
            'intercompany_sync_delivery_receipt': True,
            'intercompany_document_state': 'posted',
        })

        self.inter_comp_location = self.env.ref('stock.stock_location_inter_company')
        self.warehouse_b = self.env['stock.warehouse'].search([('company_id', '=', self.company_b.id)], limit=1)
        self.stock_location_b = self.warehouse_b.lot_stock_id

        # needed for fetching stock card report lines from both companies
        self.StockCardReport = self.StockCardReport.with_context(allowed_company_ids=(self.company | self.company_b).ids)

    def _make_inventory_adjustment(self, product, quantity, location, **kwargs):
        quant = self.env['stock.quant'].create({
            'product_id': product.id,
            'location_id': location.id,
            'inventory_quantity': quantity,
            **kwargs,
        })
        quant.action_apply_inventory()

        return quant

    def _create_internal_picking(self, product, quantity, **kwargs):
        warehouse = kwargs.get('warehouse', self.warehouse)
        location_id = kwargs.get('location', self.stock_location)
        location_dest_id = kwargs.get('location_dest', self.shelf1_location)

        picking = self.env['stock.picking'].create({
            'picking_type_id': warehouse.int_type_id.id,
            'location_id': location_id.id,
            'location_dest_id': location_dest_id.id,
            'move_ids': [Command.create({
                'company_id': warehouse.company_id.id,
                'location_id':  location_id.id,
                'location_dest_id': location_dest_id.id,
                'product_id': product.id,
                'uom_id': product.uom_id.id,
                'product_uom_qty': quantity,
            })],
        })
        picking.action_confirm()
        picking.action_assign()
        picking.move_ids.quantity = quantity
        picking.button_validate()

        return picking

    def _manual_replenishment_from_warehouse(self, product, quantity, **kwargs):
        self.warehouse_1.resupply_wh_ids = [Command.set([self.warehouse.id])]
        resupply_route = self.env['stock.route'].search([
            ('supplier_wh_id', '=', self.warehouse.id),
            ('supplied_wh_id', '=', self.warehouse_1.id)
        ])
        product.route_ids = [Command.set([resupply_route.id, self.route_mto.id])]

        replenish_wizard = self.env['product.replenish'].with_context(
            default_product_tmpl_id=product.product_tmpl_id.id
        ).create({
            'product_id': product.id,
            'product_tmpl_id': product.product_tmpl_id.id,
            'uom_id': self.uom_unit.id,
            'quantity': quantity,
            'warehouse_id': self.warehouse_1.id,
        })
        replenish_wizard.launch_replenishment()

        replenishment_pickings = self.env['stock.picking'].search([
            ('origin', '=', 'Manual Replenishment'),
            ('product_id', 'in', product.id)
        ])
        replenishment_pickings.action_assign()
        replenishment_pickings.move_ids.quantity = quantity
        if lot_ids := kwargs.get('lot_ids'):
            in_move_lines = replenishment_pickings.filtered(lambda p: p.picking_type_code == 'incoming').move_line_ids
            if len(lot_ids) != len(in_move_lines):
                raise UserError("The number of lots must match the number of move lines.")
            for line, lot in zip(in_move_lines, lot_ids):
                line.lot_id = lot
        replenishment_pickings.button_validate()

        return replenishment_pickings

    def _make_scrap_move(self, product, quantity, lot_ids=None):
        scrap = self.env['stock.move'].create({
            'is_scrap': True,
            'product_id': product.id,
            'lot_ids': lot_ids or [],
            'quantity': quantity,
            'company_id': self.env.company.id,
            'location_id': self.stock_location.id,
            'location_dest_id': self.scrap_location.id,
        })
        scrap._action_scrap()

        return scrap

    def _create_return_picking(self, product, order_qty, return_qty):
        # Create a delivery order
        picking_form = Form(self.env['stock.picking'])
        picking_form.picking_type_id = self.warehouse.out_type_id
        picking_form.partner_id = self.customer
        with picking_form.move_ids.new() as move:
            move.product_id = product
            move.product_uom_qty = order_qty
        picking = picking_form.save()
        picking.action_confirm()
        picking.action_assign()
        picking.button_validate()

        # Create a return
        return_picking = picking._create_return()
        return_picking.move_ids.product_uom_qty = return_qty
        return_picking.action_assign()
        return_picking.button_validate()

        return return_picking

    def _create_manufacturing_order(self, product_final, qty_final=1, qty_1=1, qty_2=2):
        """ This method is dependent on the installation of the `mrp` module. Use it accordingly. """
        bom = self.env['mrp.bom'].create({
            'product_id': product_final.id,
            'product_tmpl_id': product_final.product_tmpl_id.id,
            'uom_id': self.uom_unit.id,
            'product_qty': 1.0,
            'type': 'normal',
            'bom_line_ids': [
                Command.create({'product_id': self.component_1.id, 'product_qty': qty_1}),
                Command.create({'product_id': self.component_2.id, 'product_qty': qty_2}),
            ],
        })

        mo = self.env['mrp.production'].create({
            'product_id': product_final.id,
            'bom_id': bom.id,
            'product_qty': qty_final,
        })
        mo.action_confirm()
        mo.button_mark_done()

        return mo

    def _create_repair_order(self, product, order_qty, return_qty):
        """ This method is dependent on the installation of the `repair` module. Use it accordingly. """
        return_picking = self._create_return_picking(product, order_qty, return_qty)
        res_dict = return_picking.action_repair_return()
        repair_form = Form.from_action(self.env, res_dict)
        repair_form.product_id = product
        repair = repair_form.save()
        repair.action_validate()
        repair.action_repair_end()

        return repair

    def _create_dropship_picking(self, product, quantity, cost, **kwargs):
        """ This method is dependent on the installation of the `stock_dropshipping` module. Use it accordingly. """
        sale_order = self.env['sale.order'].create({
            'partner_id': self.customer.id,
            'partner_invoice_id': self.customer.id,
            'partner_shipping_id': self.customer.id,
            'order_line': [
                Command.create({
                    'name': product.name,
                    'product_id': product.id,
                    'product_uom_qty': quantity,
                    'price_unit': cost,
                }),
            ],
            'picking_policy': 'direct',
            **kwargs,
        })
        sale_order.action_confirm()
        purchase_order = self.env['purchase.order'].search([('partner_id', '=', self.vendor.id)])
        purchase_order.button_confirm()
        picking_dropship = purchase_order.picking_ids
        picking_dropship.move_ids.quantity = quantity
        picking_dropship.button_validate()

        return picking_dropship

    def _create_lots(self, product, count):
        return self.env['stock.lot'].create([
            {
                'name': f'lot{i}',
                'product_id': product.id,
            }
            for i in range(1, count + 1)
        ])

    def _get_report_lines_domain(self, case):
        """ Return the domain for the stock card report lines corresponding to the given test case. """
        for operation, _ in case['moves']:
            domain = Domain('product_id', '=', case['product'].id)
            match operation:
                case 'internal':
                    domain &= Domain('operation_type', '=', 'internal')
                case 'transit':
                    domain &= (
                        Domain('location_id.usage', '=', 'transit')
                        | Domain('location_dest_id.usage', '=', 'transit')
                    )
                case 'repair':
                    domain &= (
                        Domain('move_id.picking_id.return_id', '!=', False)  # For return order
                        | Domain('operation_type', '=', 'repair_operation')  # For repair order
                    )

        return domain

    def _perform_operation(self, case):
        """
        Perform the stock operations defined in the test case for the generated report lines.

        The test data consumed by this helper must follow the convention used by the
        `stock_card_report_test_data/*_data` modules (e.g., `receipt_delivery_data`).
        Each module contains a collection of builder functions, where each builder returns
        a tuple of `(case, expected_lines)`.

        The `case` dictionary defines the test scenario and must contain:
            - `name`: A unique identifier for the scenario, used in subtests.
            Scenarios within a dataset should be uniquely separated by
            cost method/removal strategy. New test datasets should follow
            the same convention unless the scenario specifically targets a behavior
            that is independent of the product cost method/removal strategy.
            - `product`: The product for which the stock card report is generated
            and whose report lines are asserted. This is intentionally independent
            of the products used by the moves operations. Individual operations may
            involve different products (e.g., manufacturing components), but only
            the report lines for `case['product']` are validated.
            - `moves`: A sequence of stock operations to execute in chronological
            order. Each operation's structure depends on the operation type
            (e.g., receipt, delivery, internal transfer, manufacturing, scrap).
            Every supported operation type must have a corresponding branch in
            the `match` statement below. If a new operation type is introduced in
            a test dataset, the `match` statement must be extended accordingly to
            execute that operation.
        """
        for operation, values in case['moves']:
            match operation:
                case 'adjustment':
                    self._make_inventory_adjustment(
                        values.pop('op_product', case['product']),
                        values.pop('quantity'),
                        values.pop('location_id'),
                        **values,
                    )
                case 'receipt':
                    self._make_in_move(
                        values.pop('op_product', case['product']),
                        values.pop('quantity'),
                        values.pop('unit_price'),
                        **values,
                    )
                case 'delivery':
                    self._make_out_move(
                        values.pop('op_product', case['product']),
                        values.pop('quantity'),
                        **values,
                    )
                case 'internal':
                    self._create_internal_picking(
                        values.pop('op_product', case['product']),
                        values.pop('quantity'),
                        **values,
                    )
                case 'transit':
                    self._manual_replenishment_from_warehouse(
                        values.pop('op_product', case['product']),
                        values.pop('quantity'),
                        **values,
                    )
                case 'scrap':
                    self._make_scrap_move(
                        values.pop('op_product', case['product']),
                        values.pop('quantity'),
                    )
                case 'manufacturing':  # `mrp` module dependent operation
                    self._create_manufacturing_order(
                        values.pop('op_product', case['product']),
                        values.pop('quantity'),
                        values.pop('quantity_1'),
                        values.pop('quantity_2'),
                    )
                case 'repair':  # `repair` module dependent operation
                    self._create_repair_order(
                        values.pop('op_product', case['product']),
                        values.pop('order_qty'),
                        values.pop('return_qty'),
                    )
                case 'dropship':  # `stock_dropshipping` module dependent operation
                    self._create_dropship_picking(
                        values.pop('op_product', case['product']),
                        values.pop('quantity'),
                        values.pop('unit_price'),
                        **values,
                    )

    def _execute_test(self, case, expected_lines):
        """
        Execute a stock movement scenario and verify the generated stock card report.

        The `case` dictionary defines the test scenario.

        The `expected_lines` value is a list of dictionaries representing the
        expected stock card report lines after all operations have been executed.
        Each dictionary corresponds to a single report line. The order of the dictionaries
        must match the order of the generated report lines.
        """
        self._perform_operation(case)
        domain = self._get_report_lines_domain(case)
        report_lines = self._get_report_lines(domain)
        self._assert_report_lines(report_lines, expected_lines)

    # ---------------------------------------------------------
    # Tests
    # ---------------------------------------------------------
    def test_stock_card_report_all_columns(self):
        """ Test stock card report's every columns """

        product = self.env['product.product'].create({
            **self.product_common_vals,
            'name': 'Lot Standard Product',
            'categ_id': self.category_standard.id,
            'tracking': 'lot',
        })
        lot = self._create_lots(product, 1)
        case = {
            'product': product,
            'moves': [
                ('receipt', {'quantity': 5, 'unit_price': 20, 'lot_ids': lot}),
            ],
        }

        self._perform_operation(case)
        domain = self._get_report_lines_domain(case)
        report_lines = self._get_report_lines(domain)

        move = self.env['stock.move'].search([('product_id', '=', product.id)])
        move_line, reference, origin = move.move_line_ids, move.reference, move.origin
        date, uom = move_line.date, move_line.uom_id
        location = self.supplier_location
        location_dest = self.stock_location
        default_code = product.default_code
        result = {
            'fields': (
                'date', 'operation_type', 'reference', 'origin', 'owner_id', 'default_code', 'product_id', 'removal_date', 'lot_id', 'location_id', 'location_dest_id', 'quantity', 'uom_id', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
            ),
            'expected_lines': [
                ( date,       'incoming',   reference,   origin,      False,   default_code,   product.id,          False,   lot.id,   location.id,   location_dest.id,        5.0,   uom.id,         0.0,      5.0,         20.0,       0.0,           5.0,        10.0,           0.0,       50.0,         0.0,           50.0),
            ]
        }

        self._assert_report_lines(report_lines, result)

    def test_stock_card_report_dropship(self):
        """ Test stock card report quantities and valuations for dropship operations. """

        if self.env['ir.module.module']._get('stock_dropshipping').state != 'installed':
            self.skipTest("This test requires the installation of the stock_dropshipping module.")

        self.dropshipping_route = self.env.ref('stock_dropshipping.route_drop_shipping')
        self.product_standard.write({
            'route_ids': [Command.set([self.dropshipping_route.id])],
            'seller_ids': [Command.create({'partner_id': self.vendor.id})],
        })

        case = {
            'name': 'Dropship',
            'product': self.product_standard,
            'moves': [
                ('dropship', {'quantity': 5, 'unit_price': 20}),
            ],
        }

        location = self.supplier_location
        location_dest = self.customer_location
        # Dropship doesn't affects quantities and valuation
        result = {
            'fields': (
                'operation_type', 'location_id', 'location_dest_id', 'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
            ),
            'expected_lines': [
                (     'dropship',   location.id,   location_dest.id,        5.0,         0.0,      0.0,          0.0,       0.0,           0.0,        10.0,           0.0,        0.0,         0.0,            0.0),
            ]
        }
        self._execute_test(case, result)

    def test_stock_card_report_consignment(self):
        """ Test stock card report quantities and valuations for consignment operations. """

        case = {
            'name': 'Consignment Receipt and Delivery',
            'product': self.product_standard,
            'moves': [
                ('receipt', {'quantity': 5, 'unit_price': 20}),
                ('receipt', {'quantity': 5, 'unit_price': 20, 'owner_id': self.owner.id}),
                ('delivery', {'quantity': 7}),
            ],
        }

        # Consignment affects quantities but doesn't affects the valuation
        result = {
            'fields': (
                'operation_type',    'owner_id', 'quantity', 'qty_start', 'qty_in', 'unit_price', 'qty_out', 'qty_balance', 'unit_cost', 'value_start', 'value_in', 'value_out', 'value_ending',
            ),
            'expected_lines': [
                (     'incoming',         False,        5.0,         0.0,      5.0,         20.0,       0.0,           5.0,        10.0,           0.0,       50.0,         0.0,           50.0),
                (     'incoming', self.owner.id,        5.0,         0.0,      5.0,          0.0,       0.0,           5.0,        10.0,           0.0,        0.0,         0.0,            0.0),
                (     'outgoing',         False,        5.0,         5.0,      0.0,          0.0,       5.0,           0.0,        10.0,          50.0,        0.0,        50.0,            0.0),
                (     'outgoing', self.owner.id,        2.0,         5.0,      0.0,          0.0,       2.0,           3.0,        10.0,           0.0,        0.0,         0.0,            0.0),
            ]
        }

        self._execute_test(case, result)


@tagged('post_install', '-at_install')
class TestStockCardStandardPrice(TestStockCardBase):
    """ Test the stock card report for products with standard price costing method. """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        # Categories
        cls.category_standard_lifo = cls.env['product.category'].create({
            'name': 'Standard LIFO',
            'property_cost_method': 'standard',
            'removal_strategy_id': cls.env.ref('stock.removal_lifo').id,
        })

        # Products
        products = cls.env['product.product'].create([
            {
                **cls.product_common_vals,
                'name': 'Lot Standard Product',
                'categ_id': cls.category_standard.id,
                'tracking': 'lot',
            }, {
                **cls.product_common_vals,
                'name': 'Serial Standard Product',
                'categ_id': cls.category_standard.id,
                'tracking': 'serial',
            }, {
                **cls.product_common_vals,
                'name': 'Standard Product LIFO',
                'categ_id': cls.category_standard_lifo.id,
            }, {
                **cls.product_common_vals,
                'name': 'Lot Standard Product LIFO',
                'categ_id': cls.category_standard_lifo.id,
                'tracking': 'lot',
            }, {
                **cls.product_common_vals,
                'name': 'Serial Standard Product LIFO',
                'categ_id': cls.category_standard_lifo.id,
                'tracking': 'serial',
            },
        ])
        (
            cls.product_standard_lot,
            cls.product_standard_srn,
            cls.product_standard_lifo,
            cls.product_standard_lot_lifo,
            cls.product_standard_srn_lifo,
        ) = products

    # ---------------------------------------------------------
    # Tests
    # ---------------------------------------------------------
    def test_standard_price_stock_card_report_receipt_delivery(self):
        """ Test stock card report quantities and valuations for receipt and delivery cases with standard price cost method. """

        for build_case in RECEIPT_DELIVERY_TESTS['standard_price']:
            case, expected_lines = build_case(self)
            with self.subTest(case=case['name']):
                self._execute_test(case, expected_lines)

    def test_standard_price_stock_card_report_inventory_adjustment(self):
        """ Test stock card report quantities and valuations for inventory adjustment cases with standard price cost method. """

        for build_case in INVENTORY_ADJUSTMENT_TESTS['standard_price']:
            case, expected_lines = build_case(self)
            with self.subTest(case=case['name']):
                self._execute_test(case, expected_lines)

    def test_standard_price_stock_card_report_internal_transfer(self):
        """ Test stock card report quantities and valuation for internal transfer with standard price cost method.
            We do not consider internal transfer as a change in the valuation.
        """

        for build_case in INTERNAL_TRANSFER_TESTS['standard_price']:
            case, expected_lines = build_case(self)
            with self.subTest(case=case['name']):
                self._execute_test(case, expected_lines)

    def test_standard_price_stock_card_report_inter_warehouse_transit(self):
        """ Test stock card report quantities and valuations for inter-warehouse transit with standard price cost method. """

        for build_case in INTER_WAREHOUSE_TESTS['standard_price']:
            case, expected_lines = build_case(self)
            with self.subTest(case=case['name']):
                self._execute_test(case, expected_lines)

    def test_standard_price_stock_card_report_lot_valuated(self):
        """ Test stock card report quantities and valuations for lot and srn when lot is valuated with standard price cost method. """

        (
            self.product_standard_lot
            | self.product_standard_srn
            | self.product_standard_lot_lifo
            | self.product_standard_srn_lifo
        ).write({
            'lot_valuated': True,
        })

        for build_case in LOT_VALUATED_TESTS['standard_price']:
            case, expected_lines = build_case(self)
            with self.subTest(case=case['name']):
                self._execute_test(case, expected_lines)

    def test_standard_price_stock_card_report_lot_not_valuated(self):
        """ Test stock card report quantities and valuations for lot and srn when lot is not valuated with standard price cost method. """

        for build_case in LOT_NOT_VALUATED_TESTS['standard_price']:
            case, expected_lines = build_case(self)
            with self.subTest(case=case['name']):
                self._execute_test(case, expected_lines)

    def test_standard_price_stock_card_report_scrap(self):
        """ Test stock card report quantities and valuations for scrap with standard price cost method. """

        for build_case in SCRAP_TESTS['standard_price']:
            case, expected_lines = build_case(self)
            with self.subTest(case=case['name']):
                self._execute_test(case, expected_lines)

    def test_standard_price_stock_card_report_inter_company_transit(self):
        """ Test stock card report quantities and valuations for inter-company transit with standard price cost method. """

        if self.env['ir.module.module']._get('sale_purchase_stock_inter_company_rules').state != 'installed':
            self.skipTest("This test requires the installation of the sale_purchase_stock_inter_company_rules module.")

        self._setup_multicompany_for_inter_company_transit()
        self.product_standard.with_company(self.company_b).standard_price = 10.0

        for build_case in INTER_COMPANY_TESTS['standard_price']:
            case, expected_lines = build_case(self)
            with self.subTest(case=case['name']):
                self._execute_test(case, expected_lines)

    def test_standard_price_stock_card_report_manufacturing(self):
        """ Test stock card report quantities and valuations for manufacturing with standard price cost method. """

        if self.env['ir.module.module']._get('mrp').state != 'installed':
            self.skipTest("This test requires the installation of the mrp module.")

        self.component_1, self.component_2 = self.env['product.product'].create([
            {**self.product_common_vals, 'name': 'Component 1'},
            {**self.product_common_vals, 'name': 'Component 2'},
        ])
        self.production_location = self.warehouse._get_production_location()

        for build_case in MANUFACTURING_TESTS['standard_price']:
            case, expected_lines = build_case(self)
            with self.subTest(case=case['name']):
                self._execute_test(case, expected_lines)

    def test_standard_price_stock_card_report_repair(self):
        """ Test stock card report quantities and valuations for repair with standard price cost method. """

        if self.env['ir.module.module']._get('repair').state != 'installed':
            self.skipTest("This test requires the installation of the repair module.")

        for build_case in REPAIR_TESTS['standard_price']:
            case, expected_lines = build_case(self)
            with self.subTest(case=case['name']):
                self._execute_test(case, expected_lines)

    def test_standard_price_stock_card_report_fefo_removal_strategy(self):
        """ Test stock card report quantities and valuations for 'First Expired, First Out (FEFO)' removal strategy with standard price cost method. """

        if self.env['ir.module.module']._get('product_expiry').state != 'installed':
            self.skipTest("This test requires the installation of the product_expiry module.")

        # Categories
        self.category_standard_fefo = self.env['product.category'].create([{
            'name': 'Standard FEFO',
            'property_cost_method': 'standard',
            'removal_strategy_id': self.env.ref('product_expiry.removal_fefo').id,
        }])

        # Products
        self.product_standard_lot_fefo = self.env['product.product'].create([{
            **self.product_common_vals,
            'name': 'Lot Standard Product FEFO',
            'categ_id': self.category_standard_fefo.id,
            'tracking': 'lot',
            'use_expiration_date': True,
            'expiration_time': 5,
            'use_time': 3,
            'removal_time': 2,
            'alert_time': 4,
        }])

        for build_case in FEFO_REMOVAL_STRATEGY_TESTS['standard_price']:
            case, expected_lines = build_case(self)
            with self.subTest(case=case['name']):
                self._execute_test(case, expected_lines)


@tagged('post_install', '-at_install')
class TestStockCardAvco(TestStockCardBase):
    """ Test the stock card report for products with average costing method. """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        # Categories
        cls.category_avco_lifo = cls.env['product.category'].create({
            'name': 'AVCO LIFO',
            'property_cost_method': 'average',
            'removal_strategy_id': cls.env.ref('stock.removal_lifo').id,
        })

        # Products
        products = cls.env['product.product'].create([
            {
                **cls.product_common_vals,
                'name': 'Lot AVCO Product',
                'categ_id': cls.category_avco.id,
                'tracking': 'lot',
            }, {
                **cls.product_common_vals,
                'name': 'Serial AVCO Product',
                'categ_id': cls.category_avco.id,
                'tracking': 'serial',
            }, {
                **cls.product_common_vals,
                'name': 'AVCO Product LIFO',
                'categ_id': cls.category_avco_lifo.id,
            }, {
                **cls.product_common_vals,
                'name': 'Lot AVCO Product LIFO',
                'categ_id': cls.category_avco_lifo.id,
                'tracking': 'lot',
            }, {
                **cls.product_common_vals,
                'name': 'Serial AVCO Product LIFO',
                'categ_id': cls.category_avco_lifo.id,
                'tracking': 'serial',
            },
        ])
        (
            cls.product_avco_lot,
            cls.product_avco_srn,
            cls.product_avco_lifo,
            cls.product_avco_lot_lifo,
            cls.product_avco_srn_lifo,
        ) = products

    # ---------------------------------------------------------
    # Tests
    # ---------------------------------------------------------
    def test_avco_stock_card_report_partial_range(self):
        """ Values computed on a subset of the lines are the same as the ones computed on the whole ledger. """
        product = self.product_avco_lifo
        self._make_in_move(product, 5, 10)
        self._make_in_move(product, 5, 20)
        self._make_out_move(product, 4)
        self._make_in_move(product, 2, 30)
        value_fields = ('qty_start', 'qty_balance', 'value_start', 'value_in', 'value_out', 'value_ending', 'unit_cost')

        def read_values(lines):
            return {line.id: {name: line[name] for name in value_fields} for line in lines}

        lines = self._get_report_lines(Domain('product_id', '=', product.id))
        self.assertEqual(len(lines), 4)
        whole_ledger = read_values(lines)
        self.assertEqual(lines[0].value_start, 0.0)
        self.assertEqual(lines[0].qty_start, 0.0)

        for subset_ids in (lines[1:3].ids, lines[2:3].ids, lines[:1].ids):
            self.env.invalidate_all()
            subset = self.StockCardReport.browse(subset_ids)
            self.assertEqual(read_values(subset), {id_: whole_ledger[id_] for id_ in subset_ids})

    def test_avco_stock_card_report_ledger_filters_context(self):
        """ Narrowing the ledgers through the context doesn't change the values of the remaining lines. """
        product = self.product_avco_lifo
        other_product = self.env['product.product'].create({
            **self.product_common_vals,
            'name': 'Other AVCO Product',
            'categ_id': self.category_avco.id,
        })
        self._make_in_move(product, 5, 10)
        self._make_in_move(product, 5, 20)
        self._make_out_move(product, 4)
        self._make_in_move(product, 2, 30)
        self._make_in_move(other_product, 3, 40)
        value_fields = ('qty_start', 'qty_balance', 'value_start', 'value_in', 'value_out', 'value_ending', 'unit_cost')

        def read_values(lines):
            return {line.id: {name: line[name] for name in value_fields} for line in lines}

        # The moves of a test are created at the same time, spread them to tell them apart by date
        move_lines = self.env['stock.move.line'].search([('product_id', '=', product.id)], order='id')
        for day, move_line in enumerate(move_lines, start=1):
            move_line.date = fields.Datetime.from_string(f'2026-01-{day:02d} 10:00:00')

        domain = Domain('product_id', '=', product.id)
        lines = self._get_report_lines(domain)
        whole_ledger = read_values(lines)
        self.assertEqual(len(lines), 4)

        # Only the lines since the date of the third one are computed
        date_from = lines[2].date
        self.env.invalidate_all()
        report = self.StockCardReport.with_context(stock_card_date_from=fields.Datetime.to_string(date_from))
        filtered = report.search(domain, order='id')
        self.assertEqual(filtered.ids, lines[2:].ids)
        self.assertEqual(read_values(filtered), {line_id: whole_ledger[line_id] for line_id in filtered.ids})

        # Only the products and warehouses of the context are computed
        self.env.invalidate_all()
        report = self.StockCardReport.with_context(
            stock_card_product_ids=[other_product.id],
            stock_card_warehouse_ids=[self.warehouse.id],
        )
        self.assertEqual(set(report.search([]).product_id.ids), {other_product.id})

    def test_stock_card_wizard(self):
        """ The wizard opens the report with the filters used to narrow the ledgers. """
        product = self.product_avco_lifo
        wizard = self.env['stock.card.wizard'].create({
            'date_from': '2026-01-01',
            'date_to': '2026-01-31',
            'product_ids': [Command.set(product.ids)],
            'warehouse_ids': [Command.set(self.warehouse.ids)],
        })
        action = wizard.action_open_report()
        self.assertEqual(action['res_model'], 'stock.card.report')
        self.assertEqual(action['context']['stock_card_product_ids'], product.ids)
        self.assertEqual(action['context']['stock_card_warehouse_ids'], self.warehouse.ids)
        self.assertIn(('product_id', 'in', product.ids), action['domain'])
        self.assertIn(('warehouse_id', 'in', self.warehouse.ids), action['domain'])
        self.assertEqual(
            [leaf for leaf in action['domain'] if leaf[0] == 'date' and leaf[1] == '>='],
            [('date', '>=', action['context']['stock_card_date_from'])],
        )

        # Without product and warehouse, everything is included
        wizard.write({'product_ids': [Command.clear()], 'warehouse_ids': [Command.clear()]})
        action = wizard.action_open_report()
        self.assertNotIn('stock_card_product_ids', action['context'])
        self.assertNotIn('stock_card_warehouse_ids', action['context'])

        with self.assertRaises(ValidationError):
            wizard.date_to = '2025-12-31'

    def test_avco_stock_card_report_receipt_delivery(self):
        """ Test stock card report quantities and valuations for receipt and delivery cases with AVCO cost method. """

        for build_case in RECEIPT_DELIVERY_TESTS['avco']:
            case, expected_lines = build_case(self)
            with self.subTest(case=case['name']):
                self._execute_test(case, expected_lines)

    def test_avco_stock_card_report_inventory_adjustment(self):
        """ Test stock card report quantities and valuations for inventory adjustment cases with AVCO cost method. """

        for build_case in INVENTORY_ADJUSTMENT_TESTS['avco']:
            case, expected_lines = build_case(self)
            with self.subTest(case=case['name']):
                self._execute_test(case, expected_lines)

    def test_avco_stock_card_report_internal_transfer(self):
        """ Test stock card report quantities and valuation for internal transfer with AVCO cost method.
            We do not consider internal transfer as a change in the valuation.
        """

        for build_case in INTERNAL_TRANSFER_TESTS['avco']:
            case, expected_lines = build_case(self)
            with self.subTest(case=case['name']):
                self._execute_test(case, expected_lines)

    def test_avco_stock_card_report_inter_warehouse_transit(self):
        """ Test stock card report quantities and valuations for inter-warehouse transit with AVCO cost method. """

        for build_case in INTER_WAREHOUSE_TESTS['avco']:
            case, expected_lines = build_case(self)
            with self.subTest(case=case['name']):
                self._execute_test(case, expected_lines)

    def test_avco_stock_card_report_lot_valuated(self):
        """ Test stock card report quantities and valuations for lot and srn when lot is valuated with AVCO cost method. """

        (
            self.product_avco_lot
            | self.product_avco_srn
            | self.product_avco_lot_lifo
            | self.product_avco_srn_lifo
        ).write({
            'lot_valuated': True,
        })

        for build_case in LOT_VALUATED_TESTS['avco']:
            case, expected_lines = build_case(self)
            with self.subTest(case=case['name']):
                self._execute_test(case, expected_lines)

    def test_avco_stock_card_report_lot_not_valuated(self):
        """ Test stock card report quantities and valuations for lot and srn when lot is not valuated with AVCO cost method. """

        for build_case in LOT_NOT_VALUATED_TESTS['avco']:
            case, expected_lines = build_case(self)
            with self.subTest(case=case['name']):
                self._execute_test(case, expected_lines)

    def test_avco_stock_card_report_scrap(self):
        """ Test stock card report quantities and valuations for scrap with AVCO cost method. """

        for build_case in SCRAP_TESTS['avco']:
            case, expected_lines = build_case(self)
            with self.subTest(case=case['name']):
                self._execute_test(case, expected_lines)

    def test_avco_stock_card_report_inter_company_transit(self):
        """ Test stock card report quantities and valuations for inter-company transit with AVCO cost method. """

        if self.env['ir.module.module']._get('sale_purchase_stock_inter_company_rules').state != 'installed':
            self.skipTest("This test requires the installation of the sale_purchase_stock_inter_company_rules module.")

        self._setup_multicompany_for_inter_company_transit()
        self.product_avco.with_company(self.company_b).standard_price = 10.0

        for build_case in INTER_COMPANY_TESTS['avco']:
            case, expected_lines = build_case(self)
            with self.subTest(case=case['name']):
                self._execute_test(case, expected_lines)

    def test_avco_stock_card_report_manufacturing(self):
        """ Test stock card report quantities and valuations for manufacturing with AVCO cost method. """

        if self.env['ir.module.module']._get('mrp').state != 'installed':
            self.skipTest("This test requires the installation of the mrp module.")

        self.component_1, self.component_2 = self.env['product.product'].create([
            {**self.product_common_vals, 'name': 'Component 1', 'categ_id': self.category_avco.id},
            {**self.product_common_vals, 'name': 'Component 2', 'categ_id': self.category_avco.id},
        ])
        self.production_location = self.warehouse._get_production_location()

        for build_case in MANUFACTURING_TESTS['avco']:
            case, expected_lines = build_case(self)
            with self.subTest(case=case['name']):
                self._execute_test(case, expected_lines)

    def test_avco_stock_card_report_repair(self):
        """ Test stock card report quantities and valuations for repair with AVCO cost method. """

        if self.env['ir.module.module']._get('repair').state != 'installed':
            self.skipTest("This test requires the installation of the repair module.")

        for build_case in REPAIR_TESTS['avco']:
            case, expected_lines = build_case(self)
            with self.subTest(case=case['name']):
                self._execute_test(case, expected_lines)

    def test_avco_stock_card_report_fefo_removal_strategy(self):
        """ Test stock card report quantities and valuations for 'First Expired, First Out (FEFO)' removal strategy with AVCO cost method. """

        if self.env['ir.module.module']._get('product_expiry').state != 'installed':
            self.skipTest("This test requires the installation of the product_expiry module.")

        # Categories
        self.category_avco_fefo = self.env['product.category'].create([{
            'name': 'AVCO FEFO',
            'property_cost_method': 'average',
            'removal_strategy_id': self.env.ref('product_expiry.removal_fefo').id,
        }])

        # Products
        self.product_avco_lot_fefo = self.env['product.product'].create([{
            **self.product_common_vals,
            'name': 'Lot AVCO Product FEFO',
            'categ_id': self.category_avco_fefo.id,
            'tracking': 'lot',
            'use_expiration_date': True,
            'expiration_time': 5,
            'use_time': 3,
            'removal_time': 2,
            'alert_time': 4,
        }])

        for build_case in FEFO_REMOVAL_STRATEGY_TESTS['avco']:
            case, expected_lines = build_case(self)
            with self.subTest(case=case['name']):
                self._execute_test(case, expected_lines)


@tagged('post_install', '-at_install')
class TestStockCardFifo(TestStockCardBase):
    """ Test the stock card report for products with fifo costing method. """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        # Categories
        cls.category_fifo_lifo = cls.env['product.category'].create({
            'name': 'FIFO LIFO',
            'property_cost_method': 'fifo',
            'removal_strategy_id': cls.env.ref('stock.removal_lifo').id,
        })

        # Products
        products = cls.env['product.product'].create([
            {
                **cls.product_common_vals,
                'name': 'Lot FIFO Product',
                'categ_id': cls.category_fifo.id,
                'tracking': 'lot',
            }, {
                **cls.product_common_vals,
                'name': 'Serial FIFO Product',
                'categ_id': cls.category_fifo.id,
                'tracking': 'serial',
            }, {
                **cls.product_common_vals,
                'name': 'FIFO Product LIFO',
                'categ_id': cls.category_fifo_lifo.id,
            }, {
                **cls.product_common_vals,
                'name': 'Lot FIFO Product LIFO',
                'categ_id': cls.category_fifo_lifo.id,
                'tracking': 'lot',
            }, {
                **cls.product_common_vals,
                'name': 'Serial FIFO Product LIFO',
                'categ_id': cls.category_fifo_lifo.id,
                'tracking': 'serial',
            },
        ])
        (
            cls.product_fifo_lot,
            cls.product_fifo_srn,
            cls.product_fifo_lifo,
            cls.product_fifo_lot_lifo,
            cls.product_fifo_srn_lifo,
        ) = products

    # ---------------------------------------------------------
    # Tests
    # ---------------------------------------------------------
    def test_fifo_stock_card_report_receipt_delivery(self):
        """ Test stock card report quantities and valuations for receipt and delivery cases with FIFO cost method. """

        for build_case in RECEIPT_DELIVERY_TESTS['fifo']:
            case, expected_lines = build_case(self)
            with self.subTest(case=case['name']):
                self._execute_test(case, expected_lines)

    def test_fifo_stock_card_report_inventory_adjustment(self):
        """ Test stock card report quantities and valuations for inventory adjustment cases with FIFO cost method. """

        for build_case in INVENTORY_ADJUSTMENT_TESTS['fifo']:
            case, expected_lines = build_case(self)
            with self.subTest(case=case['name']):
                self._execute_test(case, expected_lines)

    def test_fifo_stock_card_report_internal_transfer(self):
        """ Test stock card report quantities and valuation for internal transfer with FIFO cost method.
            We do not consider internal transfer as a change in the valuation.
        """

        for build_case in INTERNAL_TRANSFER_TESTS['fifo']:
            case, expected_lines = build_case(self)
            with self.subTest(case=case['name']):
                self._execute_test(case, expected_lines)

    def test_fifo_stock_card_report_inter_warehouse_transit(self):
        """ Test stock card report quantities and valuations for inter-warehouse transit with FIFO cost method. """

        for build_case in INTER_WAREHOUSE_TESTS['fifo']:
            case, expected_lines = build_case(self)
            with self.subTest(case=case['name']):
                self._execute_test(case, expected_lines)

    def test_fifo_stock_card_report_lot_valuated(self):
        """ Test stock card report quantities and valuations for lot and srn when lot is valuated with FIFO cost method. """

        (
            self.product_fifo_lot
            | self.product_fifo_srn
            | self.product_fifo_lot_lifo
            | self.product_fifo_srn_lifo
        ).write({
            'lot_valuated': True,
        })

        for build_case in LOT_VALUATED_TESTS['fifo']:
            case, expected_lines = build_case(self)
            with self.subTest(case=case['name']):
                self._execute_test(case, expected_lines)

    def test_fifo_stock_card_report_lot_not_valuated(self):
        """ Test stock card report quantities and valuations for lot and srn when lot is not valuated with FIFO cost method. """

        for build_case in LOT_NOT_VALUATED_TESTS['fifo']:
            case, expected_lines = build_case(self)
            with self.subTest(case=case['name']):
                self._execute_test(case, expected_lines)

    def test_fifo_stock_card_report_scrap(self):
        """ Test stock card report quantities and valuations for scrap with FIFO cost method. """

        for build_case in SCRAP_TESTS['fifo']:
            case, expected_lines = build_case(self)
            with self.subTest(case=case['name']):
                self._execute_test(case, expected_lines)

    def test_fifo_stock_card_report_inter_company_transit(self):
        """ Test stock card report quantities and valuations for inter-company transit with FIFO cost method. """

        if self.env['ir.module.module']._get('sale_purchase_stock_inter_company_rules').state != 'installed':
            self.skipTest("This test requires the installation of the sale_purchase_stock_inter_company_rules module.")

        self._setup_multicompany_for_inter_company_transit()
        self.product_fifo.with_company(self.company_b).standard_price = 10.0

        for build_case in INTER_COMPANY_TESTS['fifo']:
            case, expected_lines = build_case(self)
            with self.subTest(case=case['name']):
                self._execute_test(case, expected_lines)

    def test_fifo_stock_card_report_manufacturing(self):
        """ Test stock card report quantities and valuations for manufacturing with FIFO cost method. """

        if self.env['ir.module.module']._get('mrp').state != 'installed':
            self.skipTest("This test requires the installation of the mrp module.")

        self.component_1, self.component_2 = self.env['product.product'].create([
            {**self.product_common_vals, 'name': 'Component 1', 'categ_id': self.category_fifo.id},
            {**self.product_common_vals, 'name': 'Component 2', 'categ_id': self.category_fifo.id},
        ])
        self.production_location = self.warehouse._get_production_location()

        for build_case in MANUFACTURING_TESTS['fifo']:
            case, expected_lines = build_case(self)
            with self.subTest(case=case['name']):
                self._execute_test(case, expected_lines)

    def test_fifo_stock_card_report_repair(self):
        """ Test stock card report quantities and valuations for repair with FIFO cost method. """

        if self.env['ir.module.module']._get('repair').state != 'installed':
            self.skipTest("This test requires the installation of the repair module.")

        for build_case in REPAIR_TESTS['fifo']:
            case, expected_lines = build_case(self)
            with self.subTest(case=case['name']):
                self._execute_test(case, expected_lines)

    def test_fifo_stock_card_report_fefo_removal_strategy(self):
        """ Test stock card report quantities and valuations for 'First Expired, First Out (FEFO)' removal strategy with FIFO cost method. """

        if self.env['ir.module.module']._get('product_expiry').state != 'installed':
            self.skipTest("This test requires the installation of the product_expiry module.")

        # Categories
        self.category_fifo_fefo = self.env['product.category'].create([{
            'name': 'FIFO FEFO',
            'property_cost_method': 'fifo',
            'removal_strategy_id': self.env.ref('product_expiry.removal_fefo').id,
        }])

        # Products
        self.product_fifo_lot_fefo = self.env['product.product'].create([{
            **self.product_common_vals,
            'name': 'Lot FIFO Product FEFO',
            'categ_id': self.category_fifo_fefo.id,
            'tracking': 'lot',
            'use_expiration_date': True,
            'expiration_time': 5,
            'use_time': 3,
            'removal_time': 2,
            'alert_time': 4,
        }])

        for build_case in FEFO_REMOVAL_STRATEGY_TESTS['fifo']:
            case, expected_lines = build_case(self)
            with self.subTest(case=case['name']):
                self._execute_test(case, expected_lines)
