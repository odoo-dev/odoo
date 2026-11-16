# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import Command
from odoo.tests import Form

from odoo.addons.base.tests.common import BaseCommon


class TestStockCommon(BaseCommon):
    """ Minimal shared base for stock tests.

    Provides one warehouse (``warehouse``) with its core locations and picking
    types, one stock-manager user (``user_stock_manager``) and one regular stock
    user (``user_stock_user``), and a small set of factory helpers for the most
    common stock test setup: building a picking, validating it, seeding a quant,
    creating a warehouse, creating an orderpoint.

    Add more shared fixtures here only once an actual test needs them, not because
    an old test used to have something similar - see stock_tests.md.
    """

    # Puts every test in this class under `base.test_company`, so `cls.warehouse`
    # below (test-only data, loaded from tests/data/stock_warehouse.xml) belongs to
    # the current company - and restricts the test users to that one company only
    # (BaseCommon.setUpClass sets their company_ids to just this company), so every
    # test here runs as if `base.test_company` were the only company that exists.
    _test_independent_company_xmlid = 'base.test_company'

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        # product.group_product_manager/base.group_system: on top of stock
        # management itself, tests use this user for the few things that need
        # broader rights (editing a product's allowed UoMs, decimal precision
        # settings) instead of sudo().
        cls.user_stock_manager = cls._create_new_internal_user(
            name='Stock Manager',
            login='stock_manager',
            groups='stock.group_stock_manager,product.group_product_manager,base.group_system',
        )
        cls.user_stock_user = cls._create_new_internal_user(
            name='Stock User',
            login='stock_user',
            groups='stock.group_stock_user',
        )

        # Pre-made test warehouse for base.test_company (one_step reception,
        # ship_only delivery - stock.warehouse's own defaults) - reuse it instead
        # of creating a new one, same spirit as base.test_company itself.
        cls.warehouse = cls.env.ref('stock.test_warehouse')

        cls.picking_type_in = cls.warehouse.in_type_id
        cls.picking_type_int = cls.warehouse.int_type_id
        cls.picking_type_out = cls.warehouse.out_type_id

        cls.stock_location = cls.warehouse.lot_stock_id
        # These two are referenced, not created: they're so foundational
        # (default res.partner.property_stock_supplier/customer, etc.) that a
        # test editing or deleting one would break stock behavior broadly, not
        # just fail our own tests later and confusingly - the usual quick_ref
        # risk doesn't add much here.
        cls.supplier_location = cls.quick_ref('stock.stock_location_suppliers')
        cls.customer_location = cls.quick_ref('stock.stock_location_customers')
        # Computed per company (res.company.scrap_location_id), not a fixed
        # xmlid - no quick_ref risk, just read it directly.
        cls.scrap_location = cls.env.company.scrap_location_id

        cls.uom_unit = cls.quick_ref('uom.product_uom_unit')

        # uom.product_uom_pack_6, unlike the locations above, is narrow/
        # isolated regular data - even explicitly listed as "unprotected"
        # (deletable) in UomUom._unprotected_uom_xml_ids - so create our own
        # instead of relying on the shared one surviving. Still prefer this
        # over uom.product_uom_dozen (inactive by default) whenever a test
        # needs a second, coarser UoM.
        cls.uom_pack_6 = cls.env['uom.uom'].with_user(cls.user_stock_manager).create({
            'name': 'Test Pack of 6',
            'relative_factor': 6,
            'relative_uom_id': cls.uom_unit.id,
        })

        cls.product = cls._create_product(name='Test Product')
        cls.product_lot = cls._create_product(name='Test Product (Lot)', tracking='lot')
        cls.product_serial = cls._create_product(name='Test Product (Serial)', tracking='serial')

    @classmethod
    def _create_product(cls, **values):
        product_values = {
            'name': 'Test Product',
            'is_storable': True,
            'uom_id': cls.uom_unit.id,
        }
        product_values.update(values)
        # with_user: creating/editing a product needs product.group_product_manager,
        # which only user_stock_manager has (not the restricted test user).
        return cls.env['product.product'].with_user(cls.user_stock_manager).create(product_values)

    def _check_inventory(self, product, quantities, lot=None, package=None, owner=None):
        """ Assert the available quantity of `product` at each location in
        `quantities` (a `{location: qty}` mapping) matches `qty`.

        :param lot: optional `stock.lot` - check the quantity available under
            that specific lot/serial number instead of `product`'s total at
            the location.
        :param package: optional `stock.package` - check the quantity
            available in that specific package.
        :param owner: optional `res.partner` - check the quantity available
            owned by that specific partner.

        A negative `qty` checks how far negative the location's available
        quantity actually went (`allow_negative=True`) - e.g. a supplier
        location after a receipt - instead of the default behavior of clamping
        a negative available quantity to 0.
        """
        for location, quantity in quantities.items():
            self.assertEqual(
                self.env['stock.quant']._get_available_quantity(
                    product, location, lot_id=lot, package_id=package, owner_id=owner,
                    allow_negative=(quantity < 0)),
                quantity,
            )

    def _create_move(self, product, src_location, dst_location, **values):
        # A move always has a picking type in reality (there's no way to create
        # one without it in the UI) - default to the matching one: receipt,
        # delivery, or internal transfer otherwise.
        move_values = {
            'product_id': product.id,
            'location_id': src_location.id,
            'location_dest_id': dst_location.id,
        }
        if src_location == self.supplier_location:
            move_values['picking_type_id'] = self.picking_type_in.id
        elif dst_location == self.customer_location:
            move_values['picking_type_id'] = self.picking_type_out.id
        else:
            move_values['picking_type_id'] = self.picking_type_int.id
        # with_user: the restricted default test user has no stock access rights.
        move = self.env['stock.move'].with_user(self.user_stock_manager).create(move_values)
        for field_name, value in values.items():
            move[field_name] = value
        return move

    def _validate_move(self, move, quantity=None, backorder=True):
        """ Confirm, assign, and validate a standalone `stock.move` directly - the
        low-level move lifecycle, for tests about `stock.move`/`stock.move.line`
        mechanics themselves rather than a full picking flow (for that, build a
        `stock.picking` and use `_validate_picking` instead).

        A `stock.picking` auto-marks its moves as picked just before validating
        (`_pre_action_done_hook()`: if a move has a quantity but nothing picked
        yet, mark it picked) - a bare move has no picking to do that for it, so
        this helper replicates that same condition here, rather than setting
        `picked` unconditionally.

        :param quantity: optional override for the quantity done (defaults to the
            full `product_uom_qty` demand, already reserved by `_action_assign()`).
        :param backorder: if the done quantity falls short of the demand, create
            a backorder move for the remainder (default), or cancel it.
        :return: `move`, now in the `done` state.
        """
        move._action_confirm()
        move._action_assign()
        if quantity is not None:
            move.quantity = quantity
        if move.quantity and not move.picked:
            move.picked = True
        move._action_done(cancel_backorder=not backorder)
        return move

    def _in_move(self, product, lot_names=None, validate=True, **values):
        """ Create a standalone receipt move (supplier -> stock), and validate
        it by default - alias for `_create_move(product, self.supplier_location,
        self.stock_location, **values)` optionally followed by `_validate_move()`.

        :param lot_names: optional list of lot/serial names, one per move line
            once reserved (a single name for a lot-tracked product, or one name
            per unit for a serial-tracked product) - assigned before validating.
            Confirms the move even if `validate` is False, to create the move
            lines the names get assigned to.
        :param validate: confirm, assign, and validate the move before
            returning it (default), or leave it as freshly created (`draft`,
            unless `lot_names` was given, then `confirmed`/`assigned`).
        """
        move = self._create_move(product, self.supplier_location, self.stock_location, **values)
        if lot_names is not None:
            move._action_confirm()
            for move_line, lot_name in zip(move.move_line_ids, lot_names, strict=True):
                move_line.lot_name = lot_name
        if validate:
            return self._validate_move(move)
        return move

    def _out_move(self, product, validate=True, **values):
        """ Create a standalone delivery move (stock -> customer), and
        validate it by default - alias for `_create_move(product,
        self.stock_location, self.customer_location, **values)` optionally
        followed by `_validate_move()`.

        :param validate: confirm, assign, and validate the move before
            returning it (default), or leave it freshly created (`draft`).
        """
        move = self._create_move(product, self.stock_location, self.customer_location, **values)
        if validate:
            return self._validate_move(move)
        return move

    def _create_picking(self, picking_type, moves=(), **values):
        """ Create a `stock.picking` with one move line per entry in `moves`.

        :param picking_type: a `stock.picking.type` record.
        :param moves: an iterable where each entry is either a `(product, quantity)`
            tuple, a `(product, quantity, uom)` tuple, or a plain `stock.move`
            value dict (used as-is, e.g. to override `location_id` on one line).
        :param values: extra values for the `stock.picking` itself, e.g.
            `location_id`/`location_dest_id` (default to the picking type's own
            defaults) or `partner_id`.
        :return: the created, unconfirmed `stock.picking`.
        """
        location_id = values.pop('location_id', picking_type.default_location_src_id.id)
        location_dest_id = values.pop('location_dest_id', picking_type.default_location_dest_id.id)

        move_commands = []
        for move in moves:
            if isinstance(move, dict):
                move_commands.append(Command.create(move))
                continue
            if len(move) == 3:
                product, quantity, uom = move
            else:
                product, quantity = move
                uom = product.uom_id
            move_commands.append(Command.create({
                'product_id': product.id,
                'product_uom_qty': quantity,
                'uom_id': uom.id,
                'location_id': location_id,
                'location_dest_id': location_dest_id,
            }))

        picking_values = {
            'picking_type_id': picking_type.id,
            'location_id': location_id,
            'location_dest_id': location_dest_id,
            'move_ids': move_commands,
        }
        picking_values.update(values)
        # with_user: the restricted default test user has no stock access rights.
        return self.env['stock.picking'].with_user(self.user_stock_manager).create(picking_values)

    def _validate_picking(self, picking, quantities=None, confirm=True, assign=True):
        """ Process `picking` through to completion the way a user would: confirm,
        assign, optionally override some moves' done quantity, then validate. If
        that leaves a move short of its demand, `button_validate()` raises the
        backorder confirmation wizard, which is processed here keeping the
        backorder (same as the "Create Backorder" button).

        :param quantities: optional `{move: qty}` mapping, for a partial pick -
            `button_validate()` fills in the full `product_uom_qty` demand for
            any move left at `quantities`.
        :return: `picking`, now in the `done` state.
        """
        if confirm:
            picking.action_confirm()
        if assign:
            picking.action_assign()
        for move, quantity in (quantities or {}).items():
            move.quantity = quantity
        action = picking.button_validate()
        if action is not True:
            self._process_backorder_wizard(action)
        return picking

    def _receipt(self, moves=(), validate=True, **values):
        """ Create an incoming `stock.picking`, and validate it by default -
        alias for `_create_picking(self.picking_type_in, moves, **values)`
        optionally followed by `_validate_picking()`.

        :param validate: confirm, assign, and validate the picking before
            returning it (default), or leave it freshly created (`draft`),
            for tests that need manual control between confirm and validate.
        """
        picking = self._create_picking(self.picking_type_in, moves, **values)
        if validate:
            return self._validate_picking(picking)
        return picking

    def _deliver(self, moves=(), validate=True, **values):
        """ Create an outgoing `stock.picking`, and validate it by default -
        alias for `_create_picking(self.picking_type_out, moves, **values)`
        optionally followed by `_validate_picking()`.

        :param validate: confirm, assign, and validate the picking before
            returning it (default), or leave it freshly created (`draft`),
            for tests that need manual control between confirm and validate.
        """
        picking = self._create_picking(self.picking_type_out, moves, **values)
        if validate:
            return self._validate_picking(picking)
        return picking

    def _create_procurement(self, product, location, quantity, **values):
        """ Create a stock need for `quantity` of `product` at `location`,
        the way another module creates one for a confirmed order line
        (`stock.rule.run()`) - not a hand-wired move or chain. Whichever
        `stock.rule` matches `location` (from `product.route_ids`, or
        `values['warehouse_id']`'s own routes as a fallback) decides what
        actually gets created: a single move, or a whole pull/push chain of
        them, exactly as it would for a real order.
        """
        values.setdefault('warehouse_id', self.warehouse)
        procurement = self.env['stock.rule'].Procurement(
            product, quantity, product.uom_id, location,
            product.name, product.name, self.env.company, values,
        )
        self.env['stock.rule'].with_user(self.user_stock_manager).run([procurement])

    def _sell(self, product, quantity, **values):
        """ Alias for `_create_procurement()`, defaulting the need's location
        to `self.customer_location` - the shape of need a confirmed sale
        order line creates (deliver `quantity` of `product` to the
        customer). """
        self._create_procurement(product, self.customer_location, quantity, **values)

    def _create_scrap(self, product, quantity, src_location=None, dst_location=None, **values):
        """ Create a scrap move (`is_scrap=True`) from `self.stock_location`
        to `self.scrap_location` by default - not yet scrapped. """
        scrap_values = {
            'is_scrap': True,
            'product_id': product.id,
            'quantity': quantity,
            'location_id': (src_location or self.stock_location).id,
            'location_dest_id': (dst_location or self.scrap_location).id,
            'company_id': self.env.company.id,
        }
        scrap_values.update(values)
        return self.env['stock.move'].with_user(self.user_stock_manager).create(scrap_values)

    def _scrap(self, product, quantity, src_location=None, dst_location=None, **values):
        """ Create and immediately commit a scrap move - alias for
        `_create_scrap()` followed by `_action_scrap()`. """
        scrap = self._create_scrap(product, quantity, src_location, dst_location, **values)
        scrap._action_scrap()
        return scrap

    def _process_backorder_wizard(self, action, cancel_backorder=False):
        """ Process a `stock.backorder.confirmation` wizard action, as returned by
        `stock.picking.button_validate()` or `stock.picking.batch.action_done()`
        when a backorder decision is needed. """
        env = self.env(user=self.user_stock_manager)
        wizard = Form.from_action(env, action).save()
        if cancel_backorder:
            return wizard.process_cancel_backorder()
        return wizard.process()

    def _create_warehouse(self, name, code, **values):
        warehouse_values = {
            'name': name,
            'code': code,
        }
        warehouse_values.update(values)
        # with_user: creating a warehouse grants the multi-warehouse group to
        # all stock users as a side effect (_check_multiwarehouse_group), which
        # needs base.group_erp_manager (implied by user_stock_manager's
        # base.group_system) - a plain stock.group_stock_manager can't do it.
        return self.env['stock.warehouse'].with_user(self.user_stock_manager).create(warehouse_values)

    def _create_location(self, name, parent_location=None, **values):
        """ Create a `stock.location` under `parent_location` (defaults to
        `self.stock_location`) - e.g. a shelf, for tests about reservation
        ordering across several sub-locations. """
        location_values = {
            'name': name,
            'location_id': (parent_location or self.stock_location).id,
            'usage': 'internal',
        }
        location_values.update(values)
        return self.env['stock.location'].with_user(self.user_stock_manager).create(location_values)

    def _create_orderpoint(self, product, product_min_qty, product_max_qty, **values):
        orderpoint_values = {
            'product_id': product.id,
            'product_min_qty': product_min_qty,
            'product_max_qty': product_max_qty,
            'warehouse_id': self.warehouse.id,
            'location_id': self.stock_location.id,
        }
        orderpoint_values.update(values)
        return self.env['stock.warehouse.orderpoint'].with_user(self.user_stock_manager).create(orderpoint_values)
