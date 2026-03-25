from odoo import api, fields, models, _
from odoo.exceptions import UserError

STATE_FILTER_MAP = {
    'ready': [('state', '=', 'assigned')],
    'done': [('state', '=', 'done')],
    'waiting': [('state', 'in', ['waiting', 'confirmed'])],
}


class StockPicking(models.Model):
    _inherit = 'stock.picking'

    # ──────────────── Search & Format ────────────────

    @api.model
    def search_pos_deliveries(self, config_id, filters=None):
        """Search for stock.picking records relevant to a POS config."""
        filters = filters or {}
        config = self.env['pos.config'].browse(config_id)
        if not config.exists():
            raise UserError(_("POS configuration not found."))

        warehouse = config.picking_type_id.warehouse_id
        config_ids = [config_id, *config.trusted_config_ids.ids]

        domain = [
            '|',
            ('pos_order_id.config_id', 'in', config_ids),
            '&',
            ('picking_type_id.warehouse_id', '=', warehouse.id),
            ('picking_type_id.code', '=', 'outgoing'),
            ('state', 'not in', ('draft', 'cancel')),
        ]

        search_term = filters.get('search_term')
        if search_term:
            domain = ['&'] + domain + [
                '|', '|', '|',
                ('name', 'ilike', search_term),
                ('origin', 'ilike', search_term),
                ('partner_id.name', 'ilike', search_term),
                ('partner_id.phone', 'ilike', search_term),
            ]

        state = filters.get('state')
        if state and state in STATE_FILTER_MAP:
            domain += STATE_FILTER_MAP[state]

        pickings = self.search(domain, limit=50, order='id desc')
        return [self._format_picking(p) for p in pickings]

    def _format_picking(self, picking):
        """Format a single picking for the POS frontend."""
        partner = picking.partner_id
        pos_order = picking.pos_order_id
        return {
            'id': picking.id,
            'name': picking.name,
            'state': picking.state,
            'delivery_type': self._get_delivery_type(picking),
            'partner_id': partner.id or False,
            'partner_name': partner.display_name or _('No Customer'),
            'partner_phone': partner.phone or False,
            'origin': picking.origin or '',
            'scheduled_date': fields.Datetime.to_string(picking.scheduled_date) if picking.scheduled_date else False,
            'source_location': picking.location_id.display_name,
            'dest_location': picking.location_dest_id.display_name,
            'picking_type': picking.picking_type_id.name,
            'picking_type_code': picking.picking_type_id.code,
            'pos_order_id': pos_order.id or False,
            'pos_order_name': pos_order.pos_reference if pos_order else False,
            'lines': [self._format_move(move, picking.state) for move in picking.move_ids],
            'note': picking.note or '',
        }

    @staticmethod
    def _format_move(move, picking_state):
        is_done = picking_state == 'done'
        return {
            'id': move.id,
            'product_id': move.product_id.id,
            'product_name': move.product_id.display_name,
            'qty_reserved': move.product_uom_qty if is_done else move.quantity,
            'qty_demand': move.product_uom_qty,
            'qty_done': move.quantity if is_done else 0,
            'uom_name': move.uom_id.name,
        }

    @staticmethod
    def _get_delivery_type(picking):
        if picking.pos_order_id:
            return 'pickup' if picking.pos_order_id.pos_delivery_type == 'pickup' else 'ship_later'
        if picking.picking_type_id.code == 'internal':
            return 'internal'
        if picking.sale_id:
            carrier = (picking.carrier_id.name or '').lower() if picking.carrier_id else ''
            return 'click_collect' if 'pickup' in carrier else 'sale_order'
        return 'other'

    # ──────────────── Actions ────────────────

    @api.model
    def action_assign_pos_delivery(self, picking_id):
        """Check availability (reserve stock) for a picking."""
        picking = self._get_picking(picking_id)
        picking.action_assign()
        return {'success': True, 'picking_name': picking.name}

    @api.model
    def validate_pos_delivery(self, picking_id):
        """Validate a picking from the POS (mark as done)."""
        picking = self._get_picking(picking_id)
        if picking.state == 'done':
            raise UserError(_("This delivery is already completed."))
        if picking.state == 'cancel':
            raise UserError(_("Cannot validate a cancelled delivery."))

        for move in picking.move_ids:
            move.quantity = move.product_uom_qty
            move.picked = True
        picking._action_done()

        return {
            'success': True,
            'picking_id': picking.id,
            'picking_name': picking.name,
            'state': picking.state,
        }

    @api.model
    def split_pos_delivery(self, picking_id, line_splits):
        """Partially validate a delivery: set done qty per move, then validate."""
        picking = self._get_picking(picking_id)
        if picking.state not in ('assigned', 'confirmed'):
            raise UserError(_("Can only split deliveries that are ready or confirmed."))

        for split in line_splits:
            move = self.env['stock.move'].browse(split['move_id'])
            if move.exists() and move.picking_id == picking:
                move.quantity = split.get('qty_delivered', 0)
                move.picked = True

        picking._action_done()

        result = {
            'success': True,
            'picking_id': picking.id,
            'picking_name': picking.name,
            'state': picking.state,
        }
        backorder = self.search([
            ('backorder_id', '=', picking.id),
            ('state', '!=', 'cancel'),
        ], limit=1)
        if backorder:
            result['backorder'] = {
                'id': backorder.id,
                'name': backorder.name,
                'state': backorder.state,
            }
        return result

    @api.model
    def create_warehouse_delivery(self, partner_id, lines, warehouse_id=False, immediate=False):
        """Create a new outgoing delivery for a partner.

        :param immediate: if True, validate the picking immediately (exchange in stock).
                          if False, only confirm and assign (prepare exchange).
        """
        partner = self.env['res.partner'].browse(partner_id)
        if not partner.exists():
            return {'success': False, 'error': _("Customer not found.")}

        warehouse = (
            self.env['stock.warehouse'].browse(warehouse_id).exists()
            if warehouse_id
            else self.env['stock.warehouse']
        ) or self.env['stock.warehouse'].search([], limit=1)

        if not warehouse:
            return {'success': False, 'error': _("No warehouse found to ship from.")}

        picking_type = warehouse.out_type_id
        picking = self.create({
            'picking_type_id': picking_type.id,
            'partner_id': partner.id,
            'location_id': picking_type.default_location_src_id.id,
            'location_dest_id': partner.property_stock_customer.id or picking_type.default_location_dest_id.id,
            'origin': _("Reshipment for %s", partner.name),
        })

        move_vals = []
        for line in lines:
            product = self.env['product.product'].browse(line.get('product_id'))
            if not product.exists() or product.type == 'service':
                continue
            move_vals.append({
                'product_id': product.id,
                'product_uom_qty': line.get('qty', 0),
                'picking_id': picking.id,
                'location_id': picking.location_id.id,
                'location_dest_id': picking.location_dest_id.id,
            })
        if move_vals:
            self.env['stock.move'].create(move_vals)

        picking.action_confirm()
        picking.action_assign()

        if immediate:
            for move in picking.move_ids:
                move.quantity = move.product_uom_qty
                move.picked = True
            picking._action_done()

        return {'success': True, 'picking_id': picking.id, 'picking_name': picking.name}

    # ──────────────── Helpers ────────────────

    @api.model
    def _get_picking(self, picking_id):
        """Browse and validate a picking exists."""
        picking = self.browse(picking_id)
        if not picking.exists():
            raise UserError(_("Delivery order not found."))
        return picking
