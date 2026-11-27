# Part of Odoo. See LICENSE file for full copyright and licensing details.

from collections import defaultdict

from odoo import Command, _, fields, models
from odoo.tools import formatLang


class PosOrder(models.Model):
    _inherit = 'pos.order'

    def write(self, vals):
        if vals.get('state') == 'paid':
            for order in self.filtered(lambda o: o.source in ('kiosk', 'mobile') and o.state == 'draft'):
                order._assign_self_order_lots()
        return super().write(vals)

    def _assign_self_order_lots(self):
        self.ensure_one()
        picking_type = self.config_id.picking_type_id
        if not picking_type.use_existing_lots:
            return
        lines = self.lines.filtered(
            lambda l: l.product_id.tracking in ('lot', 'serial')
            and not l.pack_lot_ids
            and l.product_id.uom_id.compare(l._get_qty_to_move(), 0) > 0
        )
        if not lines:
            return

        location = picking_type.default_location_src_id
        promised_qty = self._get_self_order_promised_lot_qty(lines.product_id)
        # sudo: only reads stock availability, nothing is returned to the caller
        Quant = self.env['stock.quant'].sudo()
        lot_vals = []
        for product, product_lines in lines.grouped('product_id').items():
            uom = product.uom_id
            product_quants = Quant
            if 'use_expiration_date' in product._fields and product.use_expiration_date:
                # Same filter as the stock reservation: never take an expired lot.
                product_quants = Quant.with_context(with_expiration=fields.Datetime.now())
            free_qty_by_lot = {}  # insertion order follows the removal strategy
            for quant in product_quants._gather(product, location).filtered('lot_id'):
                free_qty_by_lot.setdefault(quant.lot_id, -promised_qty[product.id, quant.lot_id.name])
                free_qty_by_lot[quant.lot_id] += quant.available_quantity

            for line in product_lines:
                qty_to_move = line._get_qty_to_move()
                qty_left = qty_to_move
                qty_by_lot = {}
                for lot, free_qty in free_qty_by_lot.items():
                    if uom.compare(qty_left, 0) <= 0:
                        break
                    lot_qty = min(qty_left, 1 if product.tracking == 'serial' else free_qty)
                    if uom.compare(lot_qty, 0) <= 0 or uom.compare(free_qty, lot_qty) < 0:
                        continue
                    qty_by_lot[lot] = lot_qty
                    qty_left -= lot_qty
                if not qty_by_lot:
                    continue

                if product.tracking == 'serial' or (len(qty_by_lot) == 1 and uom.compare(qty_left, 0) <= 0):
                    lots_by_line = {line: list(qty_by_lot)}
                elif uom.compare(qty_to_move, line.qty) == 0:
                    # The PoS stock flow moves a single lot per lot line: give each lot its own line.
                    # What no lot covers gets a line without lot, delivered by a backorder.
                    quantities = list(qty_by_lot.values())
                    if uom.compare(qty_left, 0) > 0:
                        quantities.append(qty_left)
                    split_lines = self._split_self_order_line(line, quantities)
                    lots_by_line = {split_line: [lot] for split_line, lot in zip(split_lines, qty_by_lot)}
                else:
                    # Only part of the line moves stock (e.g. settled sale order): do not split it.
                    continue

                for lot, qty in qty_by_lot.items():
                    free_qty_by_lot[lot] -= qty
                lot_vals += [
                    {'pos_order_line_id': lot_line.id, 'lot_name': lot.name}
                    for lot_line, line_lots in lots_by_line.items()
                    for lot in line_lots
                ]
        self.env['pos.pack.operation.lot'].create(lot_vals)
        self._log_self_order_missing_lots(lines.product_id)

    def _log_self_order_missing_lots(self, products):
        missing_qty = defaultdict(float)
        for line in self.lines.filtered(lambda l: l.product_id in products):
            qty_to_move = line._get_qty_to_move()
            if line.product_id.uom_id.compare(qty_to_move, 0) <= 0:
                continue
            if line.product_id.tracking == 'serial':
                missing_qty[line.product_id] += qty_to_move - len(line.pack_lot_ids)
            elif not line.pack_lot_ids:
                missing_qty[line.product_id] += qty_to_move
        messages = [
            _(
                "%(qty)s %(uom)s of %(product)s",
                qty=formatLang(self.env, qty, dp='Product Unit'),
                uom=product.uom_id.name,
                product=product.display_name,
            )
            for product, qty in missing_qty.items()
            if product.uom_id.compare(qty, 0) > 0
        ]
        if messages:
            self.message_post(body=_(
                "Not enough lots or serial numbers in stock. These quantities will be delivered in a backorder:%(quantities)s",
                quantities=self._markup_list_message(messages),
            ))

    def _split_self_order_line(self, line, quantities):
        new_lines = self.env['pos.order.line']
        for qty in quantities[1:]:
            new_line = line.copy({
                'qty': qty,
                'custom_attribute_value_ids': [Command.create(vals) for vals in line.custom_attribute_value_ids.copy_data()],
            })
            new_line.write(new_line._compute_amount_line_all())
            new_lines |= new_line
        # The original line keeps the rest of the amounts, so the order total stays the paid one.
        line.with_context(pos_line_split=True).write({
            'qty': quantities[0],
            'price_subtotal': line.price_subtotal - sum(new_lines.mapped('price_subtotal')),
            'price_subtotal_incl': line.price_subtotal_incl - sum(new_lines.mapped('price_subtotal_incl')),
        })
        return line | new_lines

    def _get_self_order_promised_lot_qty(self, products):
        # With stock updated at closing, lots given to earlier orders of the
        # session are not reserved yet: count them so they are not given twice.
        promised_qty = defaultdict(float)
        if self._should_create_picking_real_time():
            return promised_qty
        pending_pack_lots = self.env['pos.pack.operation.lot'].search([
            ('order_id.session_id', '=', self.session_id.id),
            ('order_id', '!=', self.id),
            ('order_id.state', 'not in', ('draft', 'cancel')),
            ('order_id.picking_ids', '=', False),
            ('product_id', 'in', products.ids),
        ])
        # A refund line gives its lots back: it lowers what is promised.
        for line, pack_lots in pending_pack_lots.grouped('pos_order_line_id').items():
            qty_to_move = line._get_qty_to_move()
            if line.product_id.uom_id.is_zero(qty_to_move):
                continue
            if line.product_id.tracking == 'serial':
                sign = 1 if qty_to_move > 0 else -1
                for pack_lot in pack_lots:
                    promised_qty[line.product_id.id, pack_lot.lot_name] += sign
            else:
                promised_qty[line.product_id.id, pack_lots[0].lot_name] += qty_to_move
        return promised_qty
