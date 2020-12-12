# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, fields, models, _
from odoo.exceptions import UserError
from odoo.osv import expression
from odoo.tools.float_utils import float_compare, float_is_zero


class StockPickingWave(models.Model):
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _name = "stock.picking.wave"
    _description = "Wave Transfer"
    _order = "name desc"

    def _default_picking_type(self):
        company = self.env.company
        picking_type = self.env['stock.picking.type'].search([
            ('company_id', '=', company.id),
            ('code', '=', 'outgoing')
        ], limit=1)
        return picking_type or False

    name = fields.Char(
        string='Wave Transfer', default='New',
        copy=False, required=True, readonly=True,
        help='Name of the wave transfer')
    user_id = fields.Many2one(
        'res.users', string='Responsible', tracking=True, check_company=True,
        readonly=True, states={'draft': [('readonly', False)], 'in_progress': [('readonly', False)]},
        help='Person responsible for this wave transfer')
    company_id = fields.Many2one(
        'res.company', string="Company", required=True, readonly=True,
        index=True, default=lambda self: self.env.company)
    picking_ids = fields.One2many(
        'stock.picking', compute='_compute_picking_ids', inverse='_set_picking_ids',
        help='List of transfers associated to this wave')
    allowed_picking_ids = fields.One2many('stock.picking', compute='_compute_allowed_picking_ids')
    move_ids = fields.One2many(
        'stock.move', string="Stock moves", compute='_compute_move_ids')
    move_line_ids = fields.One2many(
        'stock.move.line', 'wave_id', string='Stock move lines',
        readonly=True,
        states={'draft': [('readonly', False)], 'in_progress': [('readonly', False)]})
    state = fields.Selection([
        ('draft', 'Draft'),
        ('in_progress', 'In progress'),
        ('done', 'Done'),
        ('cancel', 'Cancelled')],
        store=True, compute='_compute_state',
        default='draft', copy=False, tracking=True, required=True, readonly=True, index=True)
    picking_type_id = fields.Many2one(
        'stock.picking.type', 'Operation Type', check_company=True, copy=False,
        readonly=True, states={'draft': [('readonly', False)]}, default=_default_picking_type)
    scheduled_date = fields.Datetime(
        'Scheduled Date', copy=False, store=True, readonly=True, compute="_compute_scheduled_date",
        states={'draft': [('readonly', False)]},
        help="""Scheduled date for the transfers to be processed.
              - If manually set then scheduled date for all transfers in wave will automatically update to this date.
              - If not manually changed and transfers are added/removed/updated then this will be their earliest scheduled date
                but this scheduled date will not be set for all transfers in wave.""")
    location_id = fields.Many2one('stock.location', 'Source Location')
    location_dest_id = fields.Many2one('stock.location', 'Destination Location')

    @api.depends('move_line_ids.picking_id')
    def _compute_picking_ids(self):
        for wave in self:
            wave.picking_ids = wave.move_line_ids.picking_id

    def _set_picking_ids(self):
        domain = []
        if self.location_id:
            domain.append([('location_id', '=', self.location_id.id)])
        if self.location_dest_id:
            domain.append([('location_dest_id', '=', self.location_dest_id.id)])
        if self.scheduled_date:
            domain.append([('move_id.date', '<=', self.scheduled_date)])
        if domain:
            domain.append([('picking_id', 'in', (self.picking_ids - self.move_line_ids.picking_id).ids)])
            domain = expression.AND(domain)
            self.move_line_ids += self.env['stock.move.line'].search(domain)

    @api.depends('move_line_ids.state')
    def _compute_state(self):
        for wave in self:
            if wave.move_line_ids and all(line.state == 'cancel' for line in wave.move_line_ids):
                wave.state = 'cancel'
            # Wave line is marked as done if all its not canceled transfers are done.
            elif wave.move_line_ids and all(line.state in ['cancel', 'done'] for line in wave.move_line_ids):
                wave.state = 'done'
            elif wave.move_line_ids:
                wave.state = 'in_progress'
            else:
                wave.state = 'draft'

    @api.depends('move_line_ids.picking_id.scheduled_date')
    def _compute_scheduled_date(self):
        for wave in self:
            wave.scheduled_date = min(wave.move_line_ids.picking_id.mapped('scheduled_date'), default=False)

    @api.depends('company_id', 'picking_type_id', 'state')
    def _compute_allowed_picking_ids(self):
        for wave in self:
            allowed_picking_states = ['waiting', 'confirmed', 'assigned']
            # Allows to add draft pickings only if wave is in draft as well.
            if wave.state == 'draft':
                allowed_picking_states.append('draft')
            domain = [
                ('company_id', '=', wave.company_id.id),
                ('immediate_transfer', '=', False),
                ('state', 'in', allowed_picking_states),
            ]
            if wave.picking_type_id:
                domain += [('picking_type_id', '=', wave.picking_type_id.id)]
            wave.allowed_picking_ids = self.env['stock.picking'].search(domain)

    @api.depends('move_line_ids.move_id')
    def _compute_move_ids(self):
        for wave in self:
            wave.move_ids = wave.move_line_ids.move_id

    @api.onchange('move_line_ids')
    def _onchange_move_line_ids(self):
        if self.move_line_ids:
            if any(line._origin.wave_id and line._origin.wave_id != self for line in self.move_line_ids):
                return {'warning': {'message': _('Some operations are already in another wave transfer.')}}
    # -------------------------------------------------------------------------
    # CRUD
    # -------------------------------------------------------------------------
    @api.model
    def create(self, vals):
        if vals.get('name', '/') == '/':
            vals['name'] = self.env['ir.sequence'].next_by_code('picking.wave') or '/'
        return super().create(vals)

    def write(self, vals):
        res = super().write(vals)
        if vals.get('picking_type_id'):
            self._sanity_check()
        if vals.get('picking_ids'):
            wave_without_picking_type = self.filtered(lambda wave: not wave.picking_type_id)
            if wave_without_picking_type:
                picking = self.picking_ids and self.picking_ids[0]
                wave_without_picking_type.picking_type_id = picking.picking_type_id.id
        return res

    @api.ondelete(at_uninstall=False)
    def _unlink_if_draft(self):
        if any(wave.state != 'draft' for wave in self):
            raise UserError(_("You can only delete draft wave transfers."))

    # -------------------------------------------------------------------------
    # Action methods
    # -------------------------------------------------------------------------
    def action_cancel(self):
        self.ensure_one()
        self.state = 'cancel'
        return True

    def action_print(self):
        self.ensure_one()
        return self.env.ref('stock_picking_wave.action_report_picking_wave').report_action(self)

    def action_done(self):
        self._check_company()
        if not self.env.context.get('button_validate_wave_ids'):
            self = self.with_context(button_validate_wave_ids=self.ids)
        res = self._pre_action_done_hook()
        if res is not True:
            return res
        new_move_vals = []
        for move in self.move_line_ids.move_id:
            qty = sum([line.qty_done for line in move.move_line_ids & self.move_line_ids])
            qty_split = move.product_uom._compute_quantity(move.product_uom_qty - qty, move.product_id.uom_id, rounding_method='HALF-UP')
            new_move = move._split(qty_split, waves=self)
            new_move_vals += new_move
        if new_move_vals:
            new_moves = self.env['stock.move'].create(new_move_vals)
            new_moves._action_confirm(merge=False)
        self.move_line_ids.move_id._action_done()
        return True

    def action_put_in_pack(self):
        """ Action to put move lines with 'Done' quantities into a new pack
        This method follows same logic to stock.picking.
        """
        self.ensure_one()
        if self.state not in ('done', 'cancel'):
            move_line_ids = self.move_line_ids.filtered(
                lambda ml:
                float_compare(ml.qty_done, 0.0, precision_rounding=ml.product_uom_id.rounding) > 0
                and not ml.result_package_id
            )
            if not move_line_ids:
                move_line_ids = self.move_line_ids.filtered(
                    lambda ml:
                    float_compare(ml.product_uom_qty, 0.0, precision_rounding=ml.product_uom_id.rounding) > 0
                    and float_compare(ml.qty_done, 0.0, precision_rounding=ml.product_uom_id.rounding) == 0
                )
            if move_line_ids:
                res = self._pre_put_in_pack_hook(move_line_ids)
                if not res:
                    res = self.picking_ids[0]._put_in_pack(move_line_ids, False)
                return res
            raise UserError(_("Please add 'Done' quantities to the wave picking to create a new pack."))

    # -------------------------------------------------------------------------
    # Miscellaneous
    # -------------------------------------------------------------------------
    def _pre_put_in_pack_hook(self, move_line_ids):
        res = self.picking_ids[0]._check_destinations(move_line_ids)
        if res and res['res_id']:
            self.env['stock.package.destination'].browse(res['res_id']).wave_id = self
        return res

    def _pre_action_done_hook(self):
        if not self.env.context.get('skip_immediate'):
            waves_to_immediate = self._check_immediate()
            if waves_to_immediate:
                return waves_to_immediate._action_generate_immediate_wizard(show_waves=self._should_show_waves())
        return True

    def _action_generate_immediate_wizard(self, show_waves=False):
        view = self.env.ref('stock_picking_wave.view_immediate_wave')
        return {
            'name': _('Immediate Transfer?'),
            'type': 'ir.actions.act_window',
            'view_mode': 'form',
            'res_model': 'stock.immediate.wave',
            'views': [(view.id, 'form')],
            'view_id': view.id,
            'target': 'new',
            'context': dict(self.env.context, default_show_waves=show_waves, default_wave_ids=[fields.Command.link(w.id) for w in self]),
        }

    def _sanity_check(self):
        for wave in self:
            if not wave.picking_ids <= wave.allowed_picking_ids:
                erroneous_pickings = wave.picking_ids - wave.allowed_picking_ids
                raise UserError(_(
                    "The following transfers cannot be added to wave transfer %s. "
                    "Please check their states and operation types, if they aren't immediate "
                    "transfers or if they're not already part of another wave transfer.\n\n"
                    "Incompatibilities: %s", wave.name, ', '.join(erroneous_pickings.mapped('name'))))

    def _track_subtype(self, init_values):
        if 'state' in init_values:
            return self.env.ref('stock_picking_wave.mt_wave_state')
        return super()._track_subtype(init_values)

    def _should_show_waves(self):
        """Whether the different waves should be displayed on the pre action done wizards."""
        return len(self) > 1

    def _check_immediate(self):
        immediate_waves = self.browse()
        precision_digits = self.env['decimal.precision'].precision_get('Product Unit of Measure')
        for wave in self:
            if all(float_is_zero(move_line.qty_done, precision_digits=precision_digits) for move_line in wave.move_line_ids.filtered(lambda m: m.state not in ('done', 'cancel'))):
                immediate_waves |= wave
        return immediate_waves
