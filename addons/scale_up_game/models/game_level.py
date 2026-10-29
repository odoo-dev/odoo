import logging

from odoo import Command, _, api, fields, models
from odoo.exceptions import UserError, ValidationError
from odoo.tools import float_compare

_logger = logging.getLogger(__name__)


class ScaleUpGameLevel(models.Model):
    _name = 'scale.up.game.level'
    _description = 'Scale-Up Game Level'
    _order = 'sequence, id'

    name = fields.Char(required=True, translate=True)
    code = fields.Char(required=True, index=True, help="Stable identifier, e.g. restock_shelf")
    sequence = fields.Integer(default=10)
    description = fields.Text(translate=True)
    active = fields.Boolean(default=True)

    # Scenario configuration (resolved server-side; never hardcoded in JS)
    product_id = fields.Many2one(
        'product.product', string="Product", required=True, ondelete='restrict',
        domain=[('is_storable', '=', True)])
    location_src_id = fields.Many2one(
        'stock.location', string="Source Location", required=True, ondelete='restrict',
        domain=[('usage', '=', 'internal')])
    location_dest_id = fields.Many2one(
        'stock.location', string="Destination Location", required=True, ondelete='restrict',
        domain=[('usage', '=', 'internal')])
    quantity = fields.Float(string="Transfer Quantity", default=1.0, required=True)
    initial_stock_done = fields.Boolean(readonly=True, copy=False)

    _code_uniq = models.Constraint('unique(code)', 'The level code must be unique.')

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------
    @api.constrains('location_src_id', 'location_dest_id', 'quantity')
    def _check_scenario_locations(self):
        for level in self:
            src, dst = level.location_src_id, level.location_dest_id
            if level.quantity <= 0:
                raise ValidationError(_("The transfer quantity must be positive."))
            if src == dst:
                raise ValidationError(_("Source and destination must be different locations."))
            if src.usage != 'internal' or dst.usage != 'internal':
                raise ValidationError(_("Source and destination must be internal locations."))
            if not src.warehouse_id or src.warehouse_id != dst.warehouse_id:
                raise ValidationError(_("Source and destination must belong to the same warehouse."))

    def _check_configuration(self):
        """Runtime check before executing the scenario. Raises UserError."""
        self.ensure_one()
        if not (self.product_id and self.location_src_id and self.location_dest_id):
            _logger.error("Scale-Up level %s is missing product/location configuration", self.code)
            raise UserError(_("This level is not configured correctly. Please contact an administrator."))
        if not self.product_id.is_storable:
            _logger.error("Scale-Up level %s: product %s is not storable", self.code, self.product_id.display_name)
            raise UserError(_("This level is not configured correctly. Please contact an administrator."))
        try:
            self._check_scenario_locations()
        except ValidationError as e:
            _logger.error("Scale-Up level %s invalid locations: %s", self.code, e)
            raise UserError(_("This level is not configured correctly. Please contact an administrator."))
        if not self._get_picking_type():
            _logger.error("Scale-Up level %s: warehouse has no internal operation type", self.code)
            raise UserError(_("This level is not configured correctly. Please contact an administrator."))

    def _get_picking_type(self):
        self.ensure_one()
        return self.location_src_id.warehouse_id.int_type_id

    # ------------------------------------------------------------------
    # Stock reading (display only)
    # ------------------------------------------------------------------
    def _get_exact_quantity(self, location):
        """On-hand quantity of the scenario product in exactly this location
        (children excluded). Read-only and scoped to the configured product /
        location, hence the narrow sudo()."""
        self.ensure_one()
        quants = self.env['stock.quant'].sudo().search([
            ('product_id', '=', self.product_id.id),
            ('location_id', '=', location.id),
        ])
        return sum(quants.mapped('quantity'))

    # ------------------------------------------------------------------
    # Setup / reset (admin-side initialisation, NOT part of the game action)
    # ------------------------------------------------------------------
    def _set_exact_quantity(self, location, qty):
        """Set the on-hand quantity through a standard inventory adjustment."""
        self.ensure_one()
        product = self.product_id
        quants = self.env['stock.quant'].sudo().with_context(inventory_mode=True).search([
            ('product_id', '=', product.id),
            ('location_id', '=', location.id),
        ])
        current = sum(quants.mapped('quantity'))
        if float_compare(current, qty, precision_rounding=product.uom_id.rounding) == 0:
            return
        Quant = self.env['stock.quant'].sudo().with_context(inventory_mode=True)
        if quants:
            quant = quants[0]
            quant.inventory_quantity = quant.quantity + (qty - current)
            quant.inventory_quantity_set = True
            quant.action_apply_inventory()
        else:
            quant = Quant.create({
                'product_id': product.id,
                'location_id': location.id,
                'inventory_quantity': qty,
                'inventory_quantity_set': True,
            })
            quant.action_apply_inventory()

    @api.model
    def _ensure_multi_location_group(self):
        """Same effect as Inventory > Settings > Storage Locations: the transfer
        form only shows Source/Destination Location with this group."""
        group = self.env.ref('stock.group_stock_multi_locations', raise_if_not_found=False)
        if group:
            self.env.ref('base.group_user').write({'implied_ids': [Command.link(group.id)]})

    def _init_scenario_stock(self):
        for level in self.search([('initial_stock_done', '=', False)]):
            level._set_exact_quantity(level.location_src_id, level.quantity)
            level._set_exact_quantity(level.location_dest_id, 0.0)
            level.initial_stock_done = True

    def action_reset_scenario(self):
        """Admin helper for manual testing: restore initial stock and reopen sessions."""
        self.ensure_one()
        self._set_exact_quantity(self.location_src_id, self.quantity)
        self._set_exact_quantity(self.location_dest_id, 0.0)
        self.initial_stock_done = True
        self.env['scale.up.game.session'].sudo().search([('level_id', '=', self.id)]).write({
            'state': 'in_progress',
            'started_at': fields.Datetime.now(),
            'completed_at': False,
            'last_picking_id': False,
            'action_count': 0,
        })
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _("Scenario reset"),
                'message': _("Stock and game sessions were restored to their initial state."),
                'type': 'success',
                'sticky': False,
            },
        }
