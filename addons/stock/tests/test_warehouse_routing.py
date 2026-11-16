# Part of Odoo. See LICENSE file for full copyright and licensing details.

from json import loads

from odoo import Command

from odoo.addons.stock.tests.common import TestStockCommon


class TestWarehouseRouting(TestStockCommon):
    """ Warehouse configuration, push/pull routing rules, and replenishment
    (reordering rules, the replenish wizard).
    """

    _test_user_groups = ('stock.group_stock_user',)

    # ---- Reservation timing ----

    def test_scheduler_reserves_at_confirm_pickings_as_stock_arrives(self):
        """ Confirming a picking whose picking type keeps the default
        `reservation_method='at_confirm'` doesn't reserve anything by
        itself if there's no stock yet - but the scheduler keeps
        retrying for it afterwards, reserving partially and then fully
        as stock becomes available (contrast with a 'manual' picking
        type, which the scheduler never touches at all, see
        `test_reservation_method_controls_when_scheduler_auto_assigns`
        in `test_move.py`). """
        delivery = self._create_picking(self.picking_type_out, moves=[(self.product, 10)])
        delivery.action_confirm()
        self.assertFalse(delivery.move_line_ids)

        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 5)
        self.env['stock.rule'].run_scheduler()
        self.assertRecordValues(delivery.move_line_ids, [{'state': 'partially_available', 'quantity': 5.0}])

        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 5)
        self.env['stock.rule'].run_scheduler()
        self.assertRecordValues(delivery.move_line_ids, [{'state': 'assigned', 'quantity': 10.0}])

    # ---- Replenishment ----

    def test_replenish_wizard_resupplies_from_another_warehouse(self):
        """ Replenishing a product configured to resupply from another
        warehouse creates a receipt for the right quantity. """
        other_warehouse = self._create_warehouse('Small Warehouse', 'SWH')
        self.warehouse.with_user(self.user_stock_manager).resupply_wh_ids = [Command.set([other_warehouse.id])]
        resupply_route = self.env['stock.route'].search([
            ('supplier_wh_id', '=', other_warehouse.id), ('supplied_wh_id', '=', self.warehouse.id)])
        self.assertTrue(resupply_route)
        self.product.with_user(self.user_stock_manager).route_ids = [Command.link(resupply_route.id)]

        replenish_wizard = self.env['product.replenish'].with_user(self.user_stock_manager).with_context(
            default_product_tmpl_id=self.product.product_tmpl_id.id).create({
                'product_id': self.product.id,
                'product_tmpl_id': self.product.product_tmpl_id.id,
                'uom_id': self.uom_unit.id,
                'quantity': 42,
                'warehouse_id': self.warehouse.id,
            })
        replenish_wizard.launch_replenishment()

        receipt = self.env['stock.picking'].search([
            ('picking_type_id', '=', self.picking_type_in.id), ('state', '!=', 'cancel')], limit=1)
        self.assertTrue(receipt)
        self.assertEqual(receipt.move_ids.product_uom_qty, 42)

    def test_sale_need_on_mto_resupplied_product_pulls_a_linked_receipt(self):
        """ A need for a product on the "Replenish on Order (MTO)" route,
        resupplied from another warehouse, doesn't just reserve from
        whatever is already in stock - it pulls a whole chain of real,
        linked moves: the other warehouse's own delivery, feeding this
        warehouse's receipt, feeding the original delivery. Once that chain
        is actually validated end to end, the original delivery becomes
        assigned from stock that genuinely arrived through it. """
        other_warehouse = self._create_warehouse('Small Warehouse', 'SWH')
        self.warehouse.with_user(self.user_stock_manager).resupply_wh_ids = [Command.set([other_warehouse.id])]
        resupply_route = self.env['stock.route'].search([
            ('supplier_wh_id', '=', other_warehouse.id), ('supplied_wh_id', '=', self.warehouse.id)])
        self.assertTrue(resupply_route)
        # The MTO route ships inactive until a product actually enables it -
        # same as checking its "MTO" checkbox for the first time for real.
        route_mto = self.quick_ref('stock.route_warehouse0_mto')
        route_mto.with_user(self.user_stock_manager).active = True
        self.product.with_user(self.user_stock_manager).route_ids = [Command.set([resupply_route.id, route_mto.id])]
        self.env['stock.quant']._update_available_quantity(self.product, other_warehouse.lot_stock_id, 10)

        self._sell(self.product, 10)

        delivery = self.env['stock.picking'].search([
            ('picking_type_id', '=', self.picking_type_out.id), ('state', '!=', 'cancel')])
        self.assertEqual(delivery.move_ids.procure_method, 'make_to_order')
        self.assertEqual(delivery.move_ids.state, 'waiting')
        receipt = self.env['stock.picking'].search([
            ('picking_type_id', '=', self.picking_type_in.id), ('state', '!=', 'cancel')])
        self.assertEqual(receipt.move_ids.product_uom_qty, 10)
        other_warehouse_delivery = self.env['stock.picking'].search([
            ('picking_type_id', '=', other_warehouse.out_type_id.id), ('state', '!=', 'cancel')])
        self.assertEqual(other_warehouse_delivery.move_ids.product_uom_qty, 10)

        self._validate_picking(other_warehouse_delivery)
        self.assertEqual(receipt.state, 'assigned')
        self._validate_picking(receipt)

        self.assertEqual(delivery.state, 'assigned')

    # ---- Push rules ----

    def test_push_rule_triggers_a_new_move_on_action_done(self):
        """ A route with a push rule, forced onto an arbitrary move via
        its own `route_ids`, triggers that push once the move is done -
        the basic mechanic behind every automatic chain (2-step
        delivery, 3-step reception, ...) built into the warehouse's own
        configuration elsewhere in this refactor. """
        push_location = self._create_location('Push Target')
        route = self.env['stock.route'].with_user(self.user_stock_manager).create({
            'name': 'New route',
            'rule_ids': [Command.create({
                'name': 'Push to push location',
                'location_src_id': self.stock_location.id,
                'location_dest_id': push_location.id,
                'action': 'push',
                'auto': 'manual',
                'picking_type_id': self.picking_type_int.id,
            })],
        })
        move = self._create_move(
            self.product, self.supplier_location, self.stock_location,
            product_uom_qty=1, route_ids=[Command.link(route.id)])
        self._validate_move(move)

        pushed_move = move.move_dest_ids
        self.assertEqual(pushed_move.location_dest_id, push_location)

    def test_transparent_push_rule_updates_the_move_itself(self):
        """ A push rule with `auto='transparent'` doesn't create a new
        downstream move at all - it just updates the move's own
        destination directly, in place. """
        # Not a child of self.stock_location - otherwise the push rule
        # below would match its own output and re-apply itself forever.
        new_location = self.env['stock.location'].with_user(self.user_stock_manager).create(
            {'name': 'New Location', 'usage': 'internal'})
        custom_picking_type = self.env['stock.picking.type'].with_user(self.user_stock_manager).create({
            'name': 'New Picking Type',
            'code': 'internal',
            'sequence_code': 'NPT',
            'default_location_src_id': self.stock_location.id,
            'default_location_dest_id': new_location.id,
            'warehouse_id': self.warehouse.id,
        })
        route = self.env['stock.route'].with_user(self.user_stock_manager).create({
            'name': 'New route',
            'rule_ids': [Command.create({
                'name': 'Push to new location',
                'location_src_id': self.stock_location.id,
                'location_dest_id': new_location.id,
                'action': 'push',
                'auto': 'transparent',
                'picking_type_id': custom_picking_type.id,
            })],
        })
        product = self._create_product(name='Transparent Push Product', route_ids=[Command.link(route.id)])

        move = self._in_move(product, product_uom_qty=1)

        self.assertEqual(move.location_dest_id, new_location)
        positive_quant = product.with_user(self.user_stock_manager).stock_quant_ids.filtered(lambda q: q.quantity > 0)
        self.assertEqual(positive_quant.location_id, new_location)

    def test_push_rule_triggers_from_a_sublocation_of_its_source(self):
        """ A push rule still applies when the move it's reacting to
        ends up landing in a sublocation of the rule's own source, not
        just the exact location - the next step is then pushed from
        that sublocation too, to keep the route going. """
        self.warehouse.with_user(self.user_stock_manager).write({'delivery_steps': 'pick_ship'})
        subloc = self._create_location('Fancy Spot', parent_location=self.warehouse.wh_output_stock_loc_id)
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 1)

        pick = self._create_picking(self.warehouse.pick_type_id, moves=[(self.product, 1)])
        pick.action_confirm()
        pick.action_assign()
        pick.move_ids.location_dest_id = subloc
        self._validate_picking(pick, confirm=False, assign=False)

        self.assertEqual(len(pick.move_ids.move_dest_ids), 1)
        self.assertEqual(pick.move_ids.move_dest_ids.location_id, subloc)

    def test_forecasted_location_propagates_through_a_push_chain(self):
        """ `forecasted_location_id` set on a pick's move propagates all
        the way through the push chain to the ship's own final
        destination - overriding the generic output -> customer
        default. """
        self.warehouse.with_user(self.user_stock_manager).write({'delivery_steps': 'pick_ship'})
        self.env['stock.quant']._update_available_quantity(self.product, self.stock_location, 1)
        final_location = self._create_location('Partner Stock', parent_location=self.customer_location)
        pick = self._create_picking(self.warehouse.pick_type_id, moves=[{
            'product_id': self.product.id,
            'product_uom_qty': 1,
            'uom_id': self.product.uom_id.id,
            'location_id': self.warehouse.lot_stock_id.id,
            'location_dest_id': self.warehouse.wh_output_stock_loc_id.id,
            'forecasted_location_id': final_location.id,
        }])
        pick.action_confirm()
        pick.button_validate()

        ship = pick.move_ids.move_dest_ids.picking_id
        self.assertEqual(ship.location_dest_id, final_location)
        self.assertEqual(ship.move_ids.location_dest_id, final_location)

    def test_push_rule_source_location_follows_its_own_rule_not_just_the_original_destination(self):
        """ A pushed move's source location follows the push rule's own
        `location_src_id` when it's a child of the move's actual
        destination - not just whatever the original move's destination
        happened to be - so a move split across two different
        destination sublocations correctly produces two separate pushed
        moves, each sourced from its own matching sublocation. """
        self.warehouse.with_user(self.user_stock_manager).write({'reception_steps': 'two_steps'})
        input_subloc = self._create_location('Input Sublocation', parent_location=self.warehouse.wh_input_stock_loc_id)
        self.env['stock.rule'].with_user(self.user_stock_manager).create({
            'name': 'Input/Sub -> Scrap',
            'location_src_id': input_subloc.id,
            'location_dest_id': self.scrap_location.id,
            'route_id': self.warehouse.reception_route_id.id,
            'picking_type_id': self.picking_type_in.id,
            'action': 'push',
            'auto': 'manual',
        })

        move = self._create_move(
            self.product, self.supplier_location, self.warehouse.wh_input_stock_loc_id, product_uom_qty=2)
        move._action_confirm()
        move.move_line_ids.quantity = 1
        move.move_line_ids.copy({'location_dest_id': input_subloc.id, 'quantity': 1})
        self._validate_move(move)

        push_to_scrap = move.move_dest_ids.filtered(lambda m: m.location_dest_id == self.scrap_location)
        push_to_stock = move.move_dest_ids.filtered(lambda m: m.location_dest_id == self.stock_location)
        self.assertTrue(push_to_scrap)
        self.assertTrue(push_to_stock)
        self.assertEqual(push_to_scrap.location_id, input_subloc)
        self.assertEqual(push_to_stock.location_id, self.warehouse.wh_input_stock_loc_id)


class TestWarehouseRoutingMultiCompany(TestStockCommon):
    """ Multi-company isolation in warehouse/replenishment behavior. """

    _test_user_groups = ('stock.group_stock_user',)

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # A second, pre-made test company (base ships several for exactly
        # this purpose) - not created here, see stock_tests.md on reusing
        # test-only data over creating new records.
        cls.company_b = cls.quick_ref('base.test_company_template2')
        # `cls.env.user` is still the admin test user here - `_callSetUp()`
        # only switches `self.env` to `cls._test_user` per test method, so
        # the company grant has to target `cls._test_user` directly.
        cls._test_user.with_user(cls.user_stock_manager).write({'company_ids': [Command.link(cls.company_b.id)]})
        cls.user_stock_manager.with_user(cls.user_stock_manager).write({'company_ids': [Command.link(cls.company_b.id)]})
        cls.env = cls.env(context=dict(cls.env.context, allowed_company_ids=[cls.env.company.id, cls.company_b.id]))

    def test_orderpoint_replenishment_deadline_and_horizon_follow_its_own_company(self):
        """ An orderpoint's resulting receipt deadline, and the horizon
        days shown in its replenishment info, always follow the
        orderpoint's own company - not whichever company is currently
        active when it's replenished. """
        self.company_b.with_user(self.user_stock_manager).horizon_days = 30
        product = self._create_product(name='Test Storable Product')
        orderpoint = self._create_orderpoint(product, 5, 10)
        repl_info_action = orderpoint.action_stock_replenishment_info()
        repl_info = self.env[repl_info_action['res_model']].browse(repl_info_action['res_id'])

        for company in (self.company_b, self.env.company):
            orderpoint.with_company(company).action_replenish()
            receipt = self.env['stock.picking'].search([('origin', '=', orderpoint.name), ('state', '!=', 'cancel')])
            self.assertEqual(receipt.date_deadline.date(), orderpoint.deadline_date)
            receipt.action_cancel()
            lead_days_description = loads(repl_info.with_company(company).json_lead_days)['lead_days_description']
            self.assertIn(f"{orderpoint.company_id.horizon_days:g}", lead_days_description[0][1])


class TestPutaway(TestStockCommon):
    """ Putaway rules: matching by product/category, by package/packaging
    type, storage-category capacity limits, and the `closest_location`/
    `last_used` sublocation strategies.
    """

    _test_user_groups = ('stock.group_stock_user',)

    # ---- Rule matching: product vs. category, precedence ----

    def test_putaway_rule_without_product_or_category_routes_receipt(self):
        """ A putaway rule with no product/category filter reroutes every
        receipt landing in its `location_in_id` to the sublocation in
        `location_out_id`. """
        child_loc = self._create_location('Child Location')
        self.env['stock.putaway.rule'].with_user(self.user_stock_manager).create({
            'location_in_id': self.stock_location.id,
            'location_out_id': child_loc.id,
        })

        move = self._create_move(self.product, self.supplier_location, self.stock_location, product_uom_qty=100)
        move._action_confirm()

        self.assertEqual(move.move_line_ids.location_dest_id, child_loc)

    def test_putaway_rule_by_product_takes_precedence_over_category(self):
        """ When both a category-wide and a product-specific rule could
        apply, the product-specific one wins - and the product's "putaway
        rules" smart button lists both rules that genuinely apply to it. """
        category = self.env['product.category'].with_user(self.user_stock_manager).create({'name': 'Test Category'})
        self.product.with_user(self.user_stock_manager).categ_id = category
        shelf_1 = self._create_location('Shelf 1')
        shelf_2 = self._create_location('Shelf 2')
        rule_category, rule_product = self.env['stock.putaway.rule'].with_user(self.user_stock_manager).create([{
            'category_id': category.id,
            'location_in_id': self.stock_location.id,
            'location_out_id': shelf_1.id,
        }, {
            'product_id': self.product.id,
            'location_in_id': self.stock_location.id,
            'location_out_id': shelf_2.id,
        }])

        move = self._create_move(self.product, self.supplier_location, self.stock_location, product_uom_qty=100)
        move._action_confirm()

        self.assertEqual(move.move_line_ids.location_dest_id, shelf_2)
        action = self.product.product_tmpl_id.action_view_related_putaway_rules()
        self.assertEqual(self.env['stock.putaway.rule'].search(action['domain']), rule_category | rule_product)

    def test_putaway_rule_by_product_falls_back_to_category_when_product_does_not_match(self):
        """ A product-specific rule for a different product doesn't apply -
        the category-wide rule is used instead. """
        category = self.env['product.category'].with_user(self.user_stock_manager).create({'name': 'Test Category'})
        self.product.with_user(self.user_stock_manager).categ_id = category
        other_product = self._create_product(name='Other Product')
        shelf_1 = self._create_location('Shelf 1')
        shelf_2 = self._create_location('Shelf 2')
        self.env['stock.putaway.rule'].with_user(self.user_stock_manager).create([{
            'category_id': category.id,
            'location_in_id': self.stock_location.id,
            'location_out_id': shelf_1.id,
        }, {
            'product_id': other_product.id,
            'location_in_id': self.stock_location.id,
            'location_out_id': shelf_2.id,
        }])

        move = self._create_move(self.product, self.supplier_location, self.stock_location, product_uom_qty=100)
        move._action_confirm()

        self.assertEqual(move.move_line_ids.location_dest_id, shelf_1)

    def test_putaway_rule_by_category_matches_through_parent_category(self):
        """ A category-wide rule still applies when the product's own
        category is a *child* of the rule's category, not just on an exact
        category match. """
        parent_category = self.env.ref('product.product_category_goods')
        child_category = self.env['product.category'].with_user(self.user_stock_manager).create({
            'name': 'Child Category',
            'parent_id': parent_category.id,
        })
        self.product.with_user(self.user_stock_manager).categ_id = child_category
        child_loc = self._create_location('Child Location')
        self.env['stock.putaway.rule'].with_user(self.user_stock_manager).create({
            'category_id': parent_category.id,
            'location_in_id': self.stock_location.id,
            'location_out_id': child_loc.id,
        })

        move = self._create_move(self.product, self.supplier_location, self.stock_location, product_uom_qty=100)
        move._action_confirm()

        self.assertEqual(move.move_line_ids.location_dest_id, child_loc)

    def test_putaway_rule_by_more_specific_category_takes_precedence(self):
        """ Of two category rules that could both match, the one on the
        product's own (more specific, child) category wins over the one on
        a broader parent category. """
        parent_category = self.env.ref('product.product_category_goods')
        child_category = self.env['product.category'].with_user(self.user_stock_manager).create({
            'name': 'Child Category',
            'parent_id': parent_category.id,
        })
        self.product.with_user(self.user_stock_manager).categ_id = child_category
        shelf_1 = self._create_location('Shelf 1')
        shelf_2 = self._create_location('Shelf 2')
        self.env['stock.putaway.rule'].with_user(self.user_stock_manager).create([{
            'location_in_id': self.stock_location.id,
            'location_out_id': shelf_1.id,
        }, {
            'category_id': child_category.id,
            'location_in_id': self.stock_location.id,
            'location_out_id': shelf_2.id,
        }])

        move = self._create_move(self.product, self.supplier_location, self.stock_location, product_uom_qty=100)
        move._action_confirm()

        self.assertEqual(move.move_line_ids.location_dest_id, shelf_2)

    # ---- Sublocation strategies: last_used, applied on a pushed move ----

    def test_putaway_rule_remembers_last_used_sublocation(self):
        """ A `last_used` putaway rule routes the first receipt to its
        generic `location_out_id`; once a move line's destination is
        manually overridden to a sublocation and done, the next receipt
        is routed there automatically instead. """
        child_loc = self._create_location('Child Location')
        self.env['stock.putaway.rule'].with_user(self.user_stock_manager).create({
            'product_id': self.product.id,
            'location_in_id': self.stock_location.id,
            'location_out_id': self.stock_location.id,
            'sublocation': 'last_used',
        })

        move1 = self._create_move(self.product, self.supplier_location, self.stock_location, product_uom_qty=1)
        move1._action_confirm()
        self.assertEqual(move1.move_line_ids.location_dest_id, self.stock_location)
        move1.move_line_ids.location_dest_id = child_loc
        self._validate_move(move1)

        move2 = self._create_move(self.product, self.supplier_location, self.stock_location, product_uom_qty=1)
        move2._action_confirm()

        self.assertEqual(move2.move_line_ids.location_dest_id, child_loc)

    def test_putaway_rule_applies_on_pushed_move(self):
        """ A putaway rule is evaluated on the pushed Input -> Stock move of
        a 2-step reception, not on the original Vendor -> Input receipt -
        the receipt's own line keeps the generic Input destination. """
        self.warehouse.with_user(self.user_stock_manager).write({'reception_steps': 'two_steps'})
        child_loc = self._create_location('Child Location')
        self.env['stock.putaway.rule'].with_user(self.user_stock_manager).create({
            'product_id': self.product.id,
            'location_in_id': self.stock_location.id,
            'location_out_id': child_loc.id,
        })

        move_input = self._create_move(self.product, self.supplier_location, self.warehouse.wh_input_stock_loc_id, product_uom_qty=1)
        self._validate_move(move_input)

        self.assertEqual(move_input.move_line_ids.location_dest_id, self.warehouse.wh_input_stock_loc_id)
        move_stock = move_input.move_dest_ids
        self.assertEqual(move_stock.move_line_ids.location_dest_id, child_loc)

    # ---- Storage category: capacity limits & allow_new_product ----

    def test_putaway_storage_category_quantity_capacity_blocks_once_full(self):
        """ A storage category's per-product quantity capacity lets the
        putaway apply while there's room, then stops applying once the
        sublocation is full - the next receipt falls back to the generic
        destination instead of overflowing it. A `closest_location` rule
        never considers its own `location_out_id` as a candidate, even when
        that parent shares the exact same storage category - so the
        fallback above isn't the parent being "picked", it's just that
        nothing else matched. """
        storage_category = self.env['stock.storage.category'].with_user(self.user_stock_manager).create({
            'name': 'Storage category',
            'capacity_ids': [Command.create({'product_id': self.product.id, 'quantity': 100})],
        })
        child_loc = self._create_location('Child Location', storage_category_id=storage_category.id)
        self.stock_location.with_user(self.user_stock_manager).storage_category_id = storage_category
        self.env['stock.putaway.rule'].with_user(self.user_stock_manager).create({
            'product_id': self.product.id,
            'location_in_id': self.stock_location.id,
            'location_out_id': self.stock_location.id,
            'storage_category_id': storage_category.id,
            'sublocation': 'closest_location',
        })

        move1 = self._create_move(self.product, self.supplier_location, self.stock_location, product_uom_qty=100)
        move1._action_confirm()
        self.assertEqual(move1.move_line_ids.location_dest_id, child_loc)

        move2 = self._create_move(self.product, self.supplier_location, self.stock_location, product_uom_qty=100)
        move2._action_confirm()
        self.assertEqual(move2.move_line_ids.location_dest_id, self.stock_location)

    def test_putaway_storage_category_empty_only_blocks_once_occupied(self):
        """ An `allow_new_product='empty'` storage category lets the putaway
        apply only while the sublocation is still empty - once the first
        receipt is actually done there, the next one falls back to the
        generic destination. """
        storage_category = self.env['stock.storage.category'].with_user(self.user_stock_manager).create({
            'name': 'Storage category',
            'allow_new_product': 'empty',
        })
        child_loc = self._create_location('Child Location', storage_category_id=storage_category.id)
        self.env['stock.putaway.rule'].with_user(self.user_stock_manager).create({
            'product_id': self.product.id,
            'location_in_id': self.stock_location.id,
            'location_out_id': self.stock_location.id,
            'storage_category_id': storage_category.id,
            'sublocation': 'closest_location',
        })

        move1 = self._create_move(self.product, self.supplier_location, self.stock_location, product_uom_qty=100)
        self._validate_move(move1)
        self.assertEqual(move1.move_line_ids.location_dest_id, child_loc)

        move2 = self._create_move(self.product, self.supplier_location, self.stock_location, product_uom_qty=100)
        move2._action_confirm()
        self.assertEqual(move2.move_line_ids.location_dest_id, self.stock_location)

    def test_putaway_storage_category_same_product_only_blocks_different_product(self):
        """ An `allow_new_product='same'` storage category blocks the
        putaway as soon as the sublocation already holds a *different*
        product - even one that was never routed there by this rule. """
        storage_category = self.env['stock.storage.category'].with_user(self.user_stock_manager).create({
            'name': 'Storage category',
            'allow_new_product': 'same',
        })
        child_loc = self._create_location('Child Location', storage_category_id=storage_category.id)
        other_product = self._create_product(name='Other Product')
        self.env['stock.quant'].with_user(self.user_stock_manager).create({
            'product_id': other_product.id,
            'location_id': child_loc.id,
            'quantity': 1,
        })
        self.env['stock.putaway.rule'].with_user(self.user_stock_manager).create({
            'product_id': self.product.id,
            'location_in_id': self.stock_location.id,
            'location_out_id': self.stock_location.id,
            'storage_category_id': storage_category.id,
            'sublocation': 'closest_location',
        })

        move = self._create_move(self.product, self.supplier_location, self.stock_location, product_uom_qty=100)
        move._action_confirm()

        self.assertEqual(move.move_line_ids.location_dest_id, self.stock_location)

    def test_putaway_storage_category_routes_packaged_receipt(self):
        """ A storage-category putaway rule filtered by package type also
        routes a packaged receipt once it's actually in that package - the
        final location lands on the package itself, not just the move
        line. """
        storage_category = self.env['stock.storage.category'].with_user(self.user_stock_manager).create({'name': 'Storage category'})
        package_type = self.env['stock.package.type'].with_user(self.user_stock_manager).create({'name': 'Package Type'})
        child_loc = self._create_location('Child Location', storage_category_id=storage_category.id)
        package = self.env['stock.package'].with_user(self.user_stock_manager).create({'package_type_id': package_type.id})
        self.env['stock.putaway.rule'].with_user(self.user_stock_manager).create({
            'product_id': self.product.id,
            'location_in_id': self.stock_location.id,
            'location_out_id': self.stock_location.id,
            'storage_category_id': storage_category.id,
            'package_type_ids': [Command.link(package_type.id)],
            'sublocation': 'closest_location',
        })

        move = self._create_move(self.product, self.supplier_location, self.stock_location, product_uom_qty=100)
        move._action_confirm()
        move.move_line_ids.quantity = 100
        move.picked = True
        move.move_line_ids.action_put_in_pack(package_id=package.id)
        move._action_done()

        self.assertEqual(package.location_id, child_loc)

    def test_putaway_storage_category_package_capacity_blocks_once_full(self):
        """ A storage category's per-package-type capacity (distinct from
        the per-product quantity capacity) lets one package of that type in,
        then blocks the next one once the sublocation is full. """
        package_type = self.env['stock.package.type'].with_user(self.user_stock_manager).create({'name': 'Package Type'})
        storage_category = self.env['stock.storage.category'].with_user(self.user_stock_manager).create({
            'name': 'Storage category',
            'capacity_ids': [Command.create({'package_type_id': package_type.id, 'quantity': 1})],
        })
        child_loc = self._create_location('Child Location', storage_category_id=storage_category.id)
        self.env['stock.putaway.rule'].with_user(self.user_stock_manager).create({
            'product_id': self.product.id,
            'location_in_id': self.stock_location.id,
            'location_out_id': self.stock_location.id,
            'storage_category_id': storage_category.id,
            'package_type_ids': [Command.link(package_type.id)],
            'sublocation': 'closest_location',
        })

        package1 = self.env['stock.package'].with_user(self.user_stock_manager).create({'package_type_id': package_type.id})
        move1 = self._create_move(self.product, self.supplier_location, self.stock_location, product_uom_qty=100)
        move1._action_confirm()
        move1.move_line_ids.quantity = 100
        move1.picked = True
        move1.move_line_ids.action_put_in_pack(package_id=package1.id)
        move1._action_done()
        self.assertEqual(package1.location_id, child_loc)

        package2 = self.env['stock.package'].with_user(self.user_stock_manager).create({'package_type_id': package_type.id})
        move2 = self._create_move(self.product, self.supplier_location, self.stock_location, product_uom_qty=100)
        move2._action_confirm()
        move2.move_line_ids.quantity = 100
        move2.picked = True
        move2.move_line_ids.action_put_in_pack(package_id=package2.id)
        move2._action_done()
        self.assertEqual(package2.location_id, self.stock_location)

    def test_putaway_storage_category_max_weight_blocks_once_exceeded(self):
        """ A storage category's max weight caps how much of a weighted
        product its sublocation can take - the putaway stops applying once
        that weight would be exceeded, regardless of unit count. """
        self.product.with_user(self.user_stock_manager).weight = 1
        storage_category = self.env['stock.storage.category'].with_user(self.user_stock_manager).create({
            'name': 'Storage category',
            'max_weight': 100,
        })
        child_loc = self._create_location('Child Location', storage_category_id=storage_category.id)
        self.env['stock.putaway.rule'].with_user(self.user_stock_manager).create({
            'product_id': self.product.id,
            'location_in_id': self.stock_location.id,
            'location_out_id': self.stock_location.id,
            'storage_category_id': storage_category.id,
            'sublocation': 'closest_location',
        })

        move1 = self._create_move(self.product, self.supplier_location, self.stock_location, product_uom_qty=100)
        move1._action_confirm()
        self.assertEqual(move1.move_line_ids.location_dest_id, child_loc)

        move2 = self._create_move(self.product, self.supplier_location, self.stock_location, product_uom_qty=100)
        move2._action_confirm()
        self.assertEqual(move2.move_line_ids.location_dest_id, self.stock_location)
