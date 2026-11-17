from odoo import api, models
from odoo.exceptions import UserError

PULL_LIKE = ('pull', 'pull_push', 'buy', 'manufacture')


class StockRoute(models.Model):
    _inherit = 'stock.route'

    # -------------------------------------------------------------------------
    # Route flow: smart edition
    # -------------------------------------------------------------------------

    @api.model
    def route_flow_edit(self, params, apply=False):
        """ Translate an edition of the route flow view into rules.

        The edition is done on a target: a route (its rules are edited), or a
        product / product category (a dedicated route is created and set on
        it, so that the warehouse routes are left untouched).

        :param dict params:
            - kind: 'shortcut' (goods go directly from a location to another
              one, skipping the steps in between), 'insert' (add a step in
              the middle of a rule) or 'remove' (remove a step from the flow)
            - warehouse_id
            - scope: 'route' | 'category' | 'product', target_id: its id
            - product_id: product used to check the result (optional)
            - shortcut: path_rule_ids (rules from the source to the
              destination, in order), to_location_id, next_rule_id (rule taking
              the goods from the destination, if any)
            - insert: rule_id, step_name, location_id (optional, else created)
            - remove: path_rule_ids (the rule bringing the goods in the step and
              the one taking them out), to_location_id, next_rule_id (as for a
              shortcut, used when the step cannot simply be skipped)
        :param bool apply: False to only get a preview (everything is rolled back)
        :return: dict with the actions done, warnings, and the path of the
            product before / after, computed by the procurement itself.
        """
        warehouse = self.env['stock.warehouse'].browse(params['warehouse_id'])
        product = self._route_flow_check_product(params)
        self.env.flush_all()
        before = self._route_flow_describe_path(product, warehouse)
        savepoint = self.env.cr.savepoint()
        try:
            actions, warnings = self._route_flow_do_edit(params, warehouse)
            self.env.flush_all()
            after = self._route_flow_describe_path(product, warehouse)
        except Exception:
            savepoint.close(rollback=True)
            self.env.invalidate_all(flush=False)
            raise
        if apply:
            savepoint.close(rollback=False)
        else:
            savepoint.close(rollback=True)
            self.env.invalidate_all(flush=False)
        if product and before == after:
            warnings.append(self.env._(
                "No change for %(product)s: the procurement still picks the same rules "
                "(e.g. Buy and Manufacture are searched before the product routes).",
                product=product.display_name,
            ))
        return {
            'actions': actions,
            'warnings': warnings,
            'checked_on': product.display_name if product else False,
            'before': before,
            'after': after,
        }

    def _route_flow_check_product(self, params):
        """ Product used to check the result of the edition. """
        Product = self.env['product.product']
        if params['scope'] == 'product':
            return Product.browse(params['target_id'])
        product = Product.browse(params.get('product_id') or [])
        if params['scope'] == 'category' and product:
            category = self.env['product.category'].browse(params['target_id'])
            if product.categ_id != category and product.categ_id not in category.child_id:
                product = Product.search([('categ_id', 'child_of', category.id)], limit=1)
        return product

    @api.model
    def _route_flow_physical(self, rule):
        """ (source, destination) the goods physically go through with this rule. """
        picking_type = rule.picking_type_id
        source = rule.location_src_id or (rule.action == 'buy' and picking_type.default_location_src_id)
        destination = rule.location_dest_id
        if rule.action in PULL_LIKE and not rule.location_dest_from_rule and picking_type.default_location_dest_id:
            destination = picking_type.default_location_dest_id
        return source or self.env['stock.location'], destination

    def _route_flow_describe_path(self, product, warehouse):
        if not product:
            return []
        flow = self.env['stock.rule'].get_product_flow(product.id, warehouse.id)
        lines = []
        for step in flow:
            rule = self.env['stock.rule'].browse(step['rule_id'])
            source, destination = self._route_flow_physical(rule)
            source_name = source.name or (self.env._('Production') if rule.action == 'manufacture' else '?')
            lines.append('%s: %s → %s (%s)' % (
                dict(rule._fields['action']._description_selection(self.env)).get(rule.action),
                source_name, destination.name, rule.route_id.name,
            ))
        return lines

    # -------------------------------------------------------------------------
    # Edition helpers
    # -------------------------------------------------------------------------

    def _route_flow_target_route(self, params, warehouse, actions):
        """ Route receiving the new rules. """
        scope = params['scope']
        if scope == 'route':
            return self.browse(params['target_id'])
        if scope == 'product':
            record = self.env['product.product'].browse(params['target_id'])
            flags = {'product_selectable': True}
        else:
            record = self.env['product.category'].browse(params['target_id'])
            flags = {'product_categ_selectable': True}
        name = self.env._('Custom flow: %(name)s', name=record.display_name)
        route = self.search([('name', '=', name), ('company_id', 'in', [False, warehouse.company_id.id])], limit=1)
        if not route:
            route = self.create({'name': name, 'sequence': 1, 'company_id': warehouse.company_id.id, **flags})
            actions.append(self.env._('Create the route "%(route)s".', route=route.name))
        if route not in record.route_ids:
            record.route_ids = [(4, route.id)]
            actions.append(self.env._('Set it on %(record)s.', record=record.display_name))
        return route

    def _route_flow_generated_routes(self):
        """ Routes generated by the warehouses (regenerated when their steps change). """
        routes = self.browse()
        warehouses = self.env['stock.warehouse'].search([])
        for name, field in warehouses._fields.items():
            if field.type in ('many2one', 'one2many', 'many2many') and field.comodel_name == 'stock.route' and name != 'route_ids':
                routes |= warehouses.mapped(name)
        return routes

    def _route_flow_rule(self, rule, route, in_place, actions, **vals):
        """ Edit the rule in place (route scope) or copy it into the target route. """
        if in_place:
            rule.write(vals)
            actions.append(self.env._('Change the rule "%(rule)s".', rule=rule.name))
            return rule
        source = self.env['stock.location'].browse(vals.get('location_src_id')) or rule.location_src_id
        destination = self.env['stock.location'].browse(vals.get('location_dest_id')) or rule.location_dest_id
        name = '%s → %s' % (source.name or rule.picking_type_id.name, destination.name)
        new_rule = rule.copy({'route_id': route.id, 'name': name, **vals})
        actions.append(self.env._(
            'Add the rule "%(rule)s" (%(action)s, based on "%(origin)s").',
            rule=new_rule.name, action=new_rule.action, origin=rule.name,
        ))
        return new_rule

    def _route_flow_type_to(self, picking_type, destination, actions):
        """ Operation type like `picking_type` but putting the goods in `destination`. """
        if picking_type.default_location_dest_id == destination:
            return picking_type
        existing = self.env['stock.picking.type'].search([
            ('warehouse_id', '=', picking_type.warehouse_id.id),
            ('code', '=', picking_type.code),
            ('default_location_src_id', '=', picking_type.default_location_src_id.id),
            ('default_location_dest_id', '=', destination.id),
        ], limit=1)
        if existing:
            return existing
        new_type = picking_type.copy({
            'name': '%s → %s' % (picking_type.name, destination.name),
            'default_location_dest_id': destination.id,
            'sequence_code': picking_type.sequence_code,
        })
        actions.append(self.env._('Create the operation type "%(type)s".', type=new_type.name))
        return new_type

    def _route_flow_do_edit(self, params, warehouse):
        actions, warnings = [], []
        route = self._route_flow_target_route(params, warehouse, actions)
        if params['scope'] == 'route' and route in self._route_flow_generated_routes():
            warnings.append(self.env._(
                'The route "%(route)s" is generated by the warehouse: changing the warehouse steps '
                'will regenerate it and discard this edition. Prefer a product or category scope.',
                route=route.name,
            ))
        if params['kind'] == 'shortcut':
            self._route_flow_shortcut(params, route, actions, warnings)
        elif params['kind'] == 'insert':
            self._route_flow_insert(params, warehouse, route, actions, warnings)
        elif params['kind'] == 'remove':
            self._route_flow_remove(params, route, actions, warnings)
        else:
            raise UserError(self.env._('Unknown edition.'))
        return actions, warnings

    def _route_flow_shortcut(self, params, route, actions, warnings):
        """ The goods go from the source of the first rule of the path directly to
        `to_location_id`, the rules in between are skipped. """
        Rule = self.env['stock.rule']
        rules = Rule.browse(params['path_rule_ids'])
        if not rules:
            raise UserError(self.env._('There is no flow between these two locations.'))
        destination = self.env['stock.location'].browse(params['to_location_id'])
        path_locations = self.env['stock.location']
        for rule in rules:
            source, rule_destination = self._route_flow_physical(rule)
            path_locations |= source | rule_destination
        first = rules[0]
        # Rule pulled by a need beyond the destination (e.g. a customer need): it must
        # still be served once the goods are in the destination.
        demand_rule = rules.filtered(
            lambda r: r.action in ('pull', 'pull_push') and r.location_dest_id not in path_locations
        )[-1:]
        need_moves_to_destination = False
        if first.action == 'push':
            self._route_flow_rule(first, route, first.route_id == route, actions,
                                  location_dest_id=destination.id)
        elif first == demand_rule:
            # Keep the need, only change where the goods are put.
            self._route_flow_rule(first, route, first.route_id == route, actions,
                                  picking_type_id=self._route_flow_type_to(first.picking_type_id, destination, actions).id)
            demand_rule = Rule
        else:
            # The need moves with the goods: the rule now refills the destination.
            self._route_flow_rule(first, route, first.route_id == route, actions,
                                  location_dest_id=destination.id, location_dest_from_rule=True)
            need_moves_to_destination = True
        if demand_rule:
            next_rule = Rule.browse(params.get('next_rule_id') or [])
            picking_type = next_rule.picking_type_id or demand_rule.picking_type_id
            self._route_flow_rule(demand_rule, route, False, actions,
                                  location_src_id=destination.id,
                                  location_dest_from_rule=False,
                                  picking_type_id=picking_type.id,
                                  procure_method='make_to_order' if need_moves_to_destination else 'make_to_stock')
        skipped_locations = path_locations - self._route_flow_physical(first)[0] - destination
        self._route_flow_skip(params, route, rules - first, skipped_locations, actions, warnings)

    def _route_flow_skip(self, params, route, skipped, skipped_locations, actions, warnings):
        """ Rules and locations no longer used by the edited flow. """
        # Reordering rules on the skipped locations keep refilling them.
        orderpoint_domain = [('location_id', 'in', skipped_locations.ids)]
        if params['scope'] == 'product':
            orderpoint_domain.append(('product_id', '=', params['target_id']))
        elif params['scope'] == 'category':
            orderpoint_domain.append(('product_id.categ_id', 'child_of', params['target_id']))
        orderpoints = self.env['stock.warehouse.orderpoint'].search(orderpoint_domain, limit=5)
        if orderpoints:
            warnings.append(self.env._(
                'Reordering rules still refill the skipped locations: %(orderpoints)s. Archive them if the stock there is not needed anymore.',
                orderpoints=', '.join('%s (%s)' % (op.product_id.display_name, op.location_id.complete_name) for op in orderpoints),
            ))
        # Rules of the edited route are archived, the others are bypassed (route
        # scope: they still apply; product / category scope: searched after).
        own = skipped.filtered(lambda r: r.route_id == route)
        if own:
            own.active = False
            actions.append(self.env._('Archive the skipped rules: %(rules)s.', rules=', '.join(own.mapped('name'))))
        others = skipped - own
        if others and params['scope'] == 'route':
            warnings.append(self.env._(
                'These rules belong to other routes and still apply: %(rules)s.',
                rules=', '.join(others.mapped('name')),
            ))
        elif others:
            actions.append(self.env._(
                'Skip %(rules)s: the new route is searched first for this %(scope)s.',
                rules=', '.join(others.mapped('name')), scope=params['scope'],
            ))

    def _route_flow_remove(self, params, route, actions, warnings):
        """ Remove the step X from A → X → B: the operation taking the goods out of
        X keeps its role (e.g. the delivery still ships to the customer) and now
        takes them in A, the operation bringing them in X disappears. When nothing
        brings the goods physically from A (Buy / Manufacture), or when the operation
        bringing them in X carries the need, it is a shortcut A → B instead. """
        Rule = self.env['stock.rule']
        incoming, outgoing = Rule.browse(params['path_rule_ids'])
        source, step = self._route_flow_physical(incoming)
        if incoming.action in ('buy', 'manufacture') or not source or (
            incoming.action in ('pull', 'pull_push') and outgoing.action == 'push'
        ):
            # Nothing brings the goods from A, or the removed operation carries the need
            # (the push only follows it): the goods go directly from A to B instead.
            return self._route_flow_shortcut(params, route, actions, warnings)
        vals = {'location_src_id': source.id}
        if incoming.action in ('pull', 'pull_push') and outgoing.action in ('pull', 'pull_push'):
            # The goods are now taken in A as the removed operation used to (stock or chain).
            vals['procure_method'] = incoming.procure_method
        if params['scope'] != 'route' and outgoing.route_id == route:
            # Rule of a custom flow, named after its locations: keep it readable.
            vals['name'] = '%s → %s' % (source.name, outgoing.name.split(' → ')[-1])
        self._route_flow_rule(outgoing, route, outgoing.route_id == route, actions, **vals)
        self._route_flow_skip(params, route, incoming, step, actions, warnings)

    def _route_flow_insert(self, params, warehouse, route, actions, warnings):
        """ Add a step in the middle of a rule: A → B becomes A → step → B.
        The new step comes first and the existing operation keeps its role (e.g. the
        delivery still ships to the customer), it just starts from the new step. For
        Buy / Manufacture (no source location), the new step comes after them. """
        rule = self.env['stock.rule'].browse(params['rule_id'])
        step_name = (params.get('step_name') or '').strip()
        if not step_name:
            raise UserError(self.env._('Give a name to the new step.'))
        source, destination = self._route_flow_physical(rule)
        location = self.env['stock.location'].browse(params.get('location_id') or [])
        if not location:
            location = self.env['stock.location'].create({
                'name': step_name, 'location_id': warehouse.view_location_id.id, 'usage': 'internal',
            })
            actions.append(self.env._('Create the location "%(location)s".', location=location.complete_name))
        step_before = rule.action in ('push', 'pull', 'pull_push') and source
        step_type = self.env['stock.picking.type'].create({
            'name': step_name,
            'code': 'internal',
            'sequence_code': ''.join(word[0] for word in step_name.split())[:4].upper() or 'STEP',
            'warehouse_id': warehouse.id,
            'company_id': warehouse.company_id.id,
            'default_location_src_id': (source if step_before else location).id,
            'default_location_dest_id': (location if step_before else destination).id,
        })
        actions.append(self.env._('Create the operation type "%(type)s".', type=step_type.name))
        in_place = params['scope'] == 'route' and rule.route_id == route
        common = {'route_id': route.id, 'warehouse_id': warehouse.id, 'company_id': warehouse.company_id.id,
                  'picking_type_id': step_type.id}
        if step_before and rule.action == 'push':
            # A → step (new push), then the existing operation goes step → B.
            step_rule = self.env['stock.rule'].create({
                **common, 'name': '%s → %s' % (source.name, location.name), 'action': 'push', 'auto': 'manual',
                'location_src_id': source.id, 'location_dest_id': location.id,
            })
            self._route_flow_rule(rule, route, in_place, actions, location_src_id=location.id)
        elif step_before:
            # The existing operation now takes the goods in the step, on demand...
            self._route_flow_rule(rule, route, in_place, actions,
                                  location_src_id=location.id, procure_method='make_to_order')
            # ...and the step brings them there from A, as the operation used to (stock or chain).
            step_rule = self.env['stock.rule'].create({
                **common, 'name': '%s → %s' % (source.name, location.name), 'action': 'pull',
                'location_src_id': source.id, 'location_dest_id': location.id, 'location_dest_from_rule': True,
                'procure_method': rule.procure_method,
            })
        else:
            # Buy / Manufacture: they now put the goods in the step (keeping the need they
            # serve), and the step brings them where they used to go.
            if rule.location_dest_from_rule:
                self._route_flow_rule(rule, route, in_place, actions, location_dest_id=location.id)
                step_vals = {'action': 'pull', 'procure_method': 'make_to_order', 'location_dest_from_rule': True}
            else:
                self._route_flow_rule(rule, route, in_place, actions,
                                      picking_type_id=self._route_flow_type_to(rule.picking_type_id, location, actions).id)
                step_vals = {'action': 'push', 'auto': 'manual'}
            step_rule = self.env['stock.rule'].create({
                **common, **step_vals, 'name': '%s → %s' % (location.name, destination.name),
                'location_src_id': location.id, 'location_dest_id': destination.id,
            })
        actions.append(self.env._('Add the rule "%(rule)s" (%(action)s).', rule=step_rule.name, action=step_rule.action))
        if not in_place and params['scope'] == 'route':
            warnings.append(self.env._(
                'The rule "%(rule)s" belongs to the route "%(route)s" and still applies there.',
                rule=rule.name, route=rule.route_id.name,
            ))
