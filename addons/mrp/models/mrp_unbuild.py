# Part of Odoo. See LICENSE file for full copyright and licensing details.

from collections import defaultdict

from odoo import _, api, fields, models
from odoo.exceptions import UserError
from odoo.tools import float_compare, float_round
from odoo.tools.misc import clean_context


class MrpUnbuild(models.Model):
    _name = "mrp.unbuild"
    _description = "Unbuild Order"
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _order = 'id desc'

    name = fields.Char('Reference', copy=False, readonly=True, default=lambda x: _('New'))
    product_id = fields.Many2one(
        'product.product', 'Product', check_company=True,
        domain="[('type', 'in', ['product', 'consu'])]",
        required=True)
    company_id = fields.Many2one(
        'res.company', 'Company',
        default=lambda s: s.env.company,
        required=True, index=True)
    product_qty = fields.Float(
        'Quantity', default=1.0,
        required=True)
    product_uom_id = fields.Many2one(
        'uom.uom', 'Unit of Measure',
        compute='_compute_product_uom_id', store=True, readonly=False, precompute=True,
        required=True)
    bom_id = fields.Many2one(
        'mrp.bom', 'Bill of Material',
        domain="""[
        '|',
            ('product_id', '=', product_id),
            '&',
                ('product_tmpl_id.product_variant_ids', '=', product_id),
                ('product_id','=',False),
        ('type', '=', 'normal'),
        '|',
            ('company_id', '=', company_id),
            ('company_id', '=', False)
        ]""",
        check_company=True)
    mo_id = fields.Many2one(
        'mrp.production', 'Manufacturing Order',
        domain="[('state', '=', 'done'), ('product_id', '=?', product_id), ('bom_id', '=?', bom_id)]",
        check_company=True)
    mo_bom_id = fields.Many2one('mrp.bom', 'Bill of Material used on the Production Order', related='mo_id.bom_id')
    lot_id = fields.Many2one(
        'stock.lot', 'Lot/Serial Number',
        domain="[('product_id', '=', product_id)]", check_company=True)
    has_tracking=fields.Selection(related='product_id.tracking', readonly=True)
    location_id = fields.Many2one(
        'stock.location', 'Source Location',
        domain="[('usage','=','internal')]",
        check_company=True,
        compute='_compute_location_id', store=True, readonly=False, precompute=True,
        required=True, help="Location where the product you want to unbuild is.")
    location_dest_id = fields.Many2one(
        'stock.location', 'Destination Location',
        domain="[('usage','=','internal')]",
        check_company=True,
        compute='_compute_location_id', store=True, readonly=False, precompute=True,
        required=True, help="Location where you want to send the components resulting from the unbuild order.")
    consume_line_ids = fields.One2many(
        'stock.move', 'consume_unbuild_id', readonly=True,
        string='Consumed Disassembly Lines')
    produce_line_ids = fields.One2many(
        'stock.move', 'unbuild_id', readonly=True,
        string='Processed Disassembly Lines')
    state = fields.Selection([
        ('draft', 'Draft'),
        ('done', 'Done')], string='Status', default='draft')

    _sql_constraints = [
        ('qty_positive', 'check (product_qty > 0)', 'The quantity to unbuild must be positive!'),
    ]

    @api.depends('mo_id', 'product_id')
    def _compute_product_uom_id(self):
        for record in self:
            if record.mo_id.product_id and record.mo_id.product_id == record.product_id:
                record.product_uom_id = record.mo_id.product_uom_id.id
            else:
                record.product_uom_id = record.product_id.uom_id.id

    @api.depends('company_id')
    def _compute_location_id(self):
        for order in self:
            if order.company_id:
                warehouse = self.env['stock.warehouse'].search([('company_id', '=', order.company_id.id)], limit=1)
                if order.location_id.company_id != order.company_id:
                    order.location_id = warehouse.lot_stock_id
                if order.location_dest_id.company_id != order.company_id:
                    order.location_dest_id = warehouse.lot_stock_id

    @api.onchange('mo_id')
    def _onchange_mo_id(self):
        if self.mo_id:
            self.product_id = self.mo_id.product_id.id
            self.bom_id = self.mo_id.bom_id
            self.product_uom_id = self.mo_id.product_uom_id
            self.lot_id = self.mo_id.lot_producing_id
            if self.has_tracking == 'serial':
                self.product_qty = 1
            else:
                self.product_qty = self.mo_id.product_qty


    @api.onchange('product_id')
    def _onchange_product_id(self):
        if self.product_id:
            self.bom_id = self.env['mrp.bom']._bom_find(self.product_id, company_id=self.company_id.id)[self.product_id]
            self.product_uom_id = self.mo_id.product_id == self.product_id and self.mo_id.product_uom_id.id or self.product_id.uom_id.id

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if not vals.get('name') or vals['name'] == _('New'):
                vals['name'] = self.env['ir.sequence'].next_by_code('mrp.unbuild') or _('New')
        return super().create(vals_list)

    @api.ondelete(at_uninstall=False)
    def _unlink_except_done(self):
        if 'done' in self.mapped('state'):
            raise UserError(_("You cannot delete an unbuild order if the state is 'Done'."))

    def action_unbuild(self):
        self.ensure_one()
        self._check_company()
        # remove the default_* keys that was only needed in the unbuild wizard
        self.env.context = dict(clean_context(self.env.context))
        if self.product_id.tracking != 'none' and not self.lot_id.id:
            raise UserError(_('You should provide a lot number for the final product.'))

        if self.mo_id and self.mo_id.state != 'done':
            raise UserError(_('You cannot unbuild a undone manufacturing order.'))

        consume_moves = self._generate_consume_moves()
        consume_moves._action_confirm()
        produce_moves = self._generate_produce_moves()
        produce_moves._action_confirm()
        produce_moves.quantity = 0

        finished_moves = consume_moves.filtered(lambda m: m.product_id == self.product_id)
        consume_moves -= finished_moves

        if any(produce_move.has_tracking != 'none' and not self.mo_id for produce_move in produce_moves):
            raise UserError(_(
                    "Please specify a manufacturing order.\n"
                    "That way, we’ll be able to retrieve the serial numbers of the components."
                ))

        if any(consume_move.has_tracking != 'none' and not self.mo_id for consume_move in consume_moves):
            raise UserError(_('Some of your byproducts are tracked, you have to specify a manufacturing order in order to retrieve the correct byproducts.'))

        for finished_move in finished_moves:
            self.env['stock.move.line'].create({
                'move_id': finished_move.id,
                'lot_id': self.lot_id.id,
                'quantity': finished_move.product_uom_qty,
                'product_id': finished_move.product_id.id,
                'product_uom_id': finished_move.product_uom.id,
                'location_id': finished_move.location_id.id,
                'location_dest_id': finished_move.location_dest_id.id,
            })

        # TODO: Will fail if user do more than one unbuild with lot on the same MO. Need to check what other unbuild has aready took
        qty_already_used = defaultdict(float)
        for move in produce_moves | consume_moves:
            if move.has_tracking != 'none':
                original_move = move in produce_moves and self.mo_id.move_raw_ids or self.mo_id.move_finished_ids
                original_move = original_move.filtered(lambda m: m.product_id == move.product_id)
                needed_quantity = move.product_uom_qty
                moves_lines = original_move.mapped('move_line_ids')
                if move in produce_moves and self.lot_id:
                    moves_lines = moves_lines.filtered(lambda ml: self.lot_id in ml.produce_line_ids.lot_id)  # FIXME sle: double check with arm
                for move_line in moves_lines:
                    # Iterate over all move_lines until we unbuilded the correct quantity.
                    taken_quantity = min(needed_quantity, move_line.quantity - qty_already_used[move_line])
                    if taken_quantity:
                        self.env['stock.move.line'].create({
                            'move_id': move.id,
                            'lot_id': move_line.lot_id.id,
                            'quantity': taken_quantity,
                            'product_id': move.product_id.id,
                            'product_uom_id': move_line.product_uom_id.id,
                            'location_id': move.location_id.id,
                            'location_dest_id': move.location_dest_id.id,
                        })
                        needed_quantity -= taken_quantity
                        qty_already_used[move_line] += taken_quantity
            else:
                move.quantity = float_round(move.product_uom_qty, precision_rounding=move.product_uom.rounding)

        (finished_moves | consume_moves | produce_moves).picked = True
        finished_moves._action_done()
        consume_moves._action_done()
        produce_moves._action_done()
        produced_move_line_ids = produce_moves.mapped('move_line_ids').filtered(lambda ml: ml.quantity > 0)
        consume_moves.mapped('move_line_ids').write({'produce_line_ids': [(6, 0, produced_move_line_ids.ids)]})
        if self.mo_id:
            unbuild_msg = _("%(qty)s %(measure)s unbuilt in %(order)s",
                qty=self.product_qty,
                measure=self.product_uom_id.name,
                order=self._get_html_link(),
            )
            self.mo_id.message_post(
                body=unbuild_msg,
                subtype_xmlid='mail.mt_note',
            )
        return self.write({'state': 'done'})

    def _generate_consume_moves(self):
        moves = self.env['stock.move']
        for unbuild in self:
            if unbuild.mo_id:
                finished_moves = unbuild.mo_id.move_finished_ids.filtered(lambda move: move.state == 'done')
                factor = unbuild.product_qty / unbuild.mo_id.product_uom_id._compute_quantity(unbuild.mo_id.product_qty, unbuild.product_uom_id)
                for finished_move in finished_moves:
                    moves += unbuild._generate_move_from_existing_move(finished_move, factor, unbuild.location_id, finished_move.location_id)
            else:
                factor = unbuild.product_uom_id._compute_quantity(unbuild.product_qty, unbuild.bom_id.product_uom_id) / unbuild.bom_id.product_qty
                moves += unbuild._generate_move_from_bom_line(self.product_id, self.product_uom_id, unbuild.product_qty)
                for byproduct in unbuild.bom_id.byproduct_ids:
                    if byproduct._skip_byproduct_line(unbuild.product_id):
                        continue
                    quantity = byproduct.product_qty * factor
                    moves += unbuild._generate_move_from_bom_line(byproduct.product_id, byproduct.product_uom_id, quantity, byproduct_id=byproduct.id)
        return moves

    def _generate_produce_moves(self):
        moves = self.env['stock.move']
        for unbuild in self:
            if unbuild.mo_id:
                raw_moves = unbuild.mo_id.move_raw_ids.filtered(lambda move: move.state == 'done')
                factor = unbuild.product_qty / unbuild.mo_id.product_uom_id._compute_quantity(unbuild.mo_id.product_qty, unbuild.product_uom_id)
                for raw_move in raw_moves:
                    moves += unbuild._generate_move_from_existing_move(raw_move, factor, raw_move.location_dest_id, self.location_dest_id)
            else:
                factor = unbuild.product_uom_id._compute_quantity(unbuild.product_qty, unbuild.bom_id.product_uom_id) / unbuild.bom_id.product_qty
                boms, lines = unbuild.bom_id.explode(unbuild.product_id, factor, picking_type=unbuild.bom_id.picking_type_id)
                for line, line_data in lines:
                    moves += unbuild._generate_move_from_bom_line(line.product_id, line.product_uom_id, line_data['qty'], bom_line_id=line.id)
        return moves

    def _generate_move_from_existing_move(self, move, factor, location_id, location_dest_id):
        return self.env['stock.move'].create({
            'name': self.name,
            'date': self.create_date,
            'product_id': move.product_id.id,
            'product_uom_qty': move.product_uom_qty * factor,
            'product_uom': move.product_uom.id,
            'procure_method': 'make_to_stock',
            'location_dest_id': location_dest_id.id,
            'location_id': location_id.id,
            'warehouse_id': location_dest_id.warehouse_id.id,
            'unbuild_id': self.id,
            'company_id': move.company_id.id,
            'origin_returned_move_id': move.id,
        })

    def _generate_move_from_bom_line(self, product, product_uom, quantity, bom_line_id=False, byproduct_id=False):
        product_prod_location = product.with_company(self.company_id).property_stock_production
        location_id = bom_line_id and product_prod_location or self.location_id
        location_dest_id = bom_line_id and self.location_dest_id or product_prod_location
        warehouse = location_dest_id.warehouse_id
        return self.env['stock.move'].create({
            'name': self.name,
            'date': self.create_date,
            'bom_line_id': bom_line_id,
            'byproduct_id': byproduct_id,
            'product_id': product.id,
            'product_uom_qty': quantity,
            'product_uom': product_uom.id,
            'procure_method': 'make_to_stock',
            'location_dest_id': location_dest_id.id,
            'location_id': location_id.id,
            'warehouse_id': warehouse.id,
            'unbuild_id': self.id,
            'company_id': self.company_id.id,
        })

    def action_validate(self):
        self.ensure_one()
        precision = self.env['decimal.precision'].precision_get('Product Unit of Measure')
        available_qty = self.env['stock.quant']._get_available_quantity(self.product_id, self.location_id, self.lot_id, strict=True)
        unbuild_qty = self.product_uom_id._compute_quantity(self.product_qty, self.product_id.uom_id)
        if float_compare(available_qty, unbuild_qty, precision_digits=precision) >= 0:
            return self.action_unbuild()
        else:
            return {
                'name': self.product_id.display_name + _(': Insufficient Quantity To Unbuild'),
                'view_mode': 'form',
                'res_model': 'stock.warn.insufficient.qty.unbuild',
                'view_id': self.env.ref('mrp.stock_warn_insufficient_qty_unbuild_form_view').id,
                'type': 'ir.actions.act_window',
                'context': {
                    'default_product_id': self.product_id.id,
                    'default_location_id': self.location_id.id,
                    'default_unbuild_id': self.id,
                    'default_quantity': unbuild_qty,
                    'default_product_uom_name': self.product_id.uom_name,
                },
                'target': 'new',
            }
