import logging

from odoo import Command, _, api, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tools import float_compare

_logger = logging.getLogger(__name__)


class ScaleUpGameSession(models.Model):
    _name = 'scale.up.game.session'
    _description = 'Scale-Up Game Session'
    _order = 'id desc'

    name = fields.Char(required=True, default=lambda self: _("New"))
    user_id = fields.Many2one(
        'res.users', string="Player", required=True, index=True, ondelete='cascade',
        default=lambda self: self.env.user)
    level_id = fields.Many2one('scale.up.game.level', string="Level", required=True, ondelete='restrict')
    state = fields.Selection(
        [('in_progress', "In Progress"), ('completed', "Completed"), ('failed', "Failed")],
        default='in_progress', required=True)
    started_at = fields.Datetime(default=fields.Datetime.now)
    completed_at = fields.Datetime()
    last_picking_id = fields.Many2one('stock.picking', string="Last Transfer", ondelete='set null')
    action_count = fields.Integer(string="Successful Actions", default=0)

    _user_level_uniq = models.Constraint(
        'unique(user_id, level_id)', 'A player can only have one session per level.')

    # ------------------------------------------------------------------
    # ORM overrides: players can't forge progress through a raw create()
    # ------------------------------------------------------------------
    @api.model_create_multi
    def create(self, vals_list):
        is_admin = self.env.user.has_group('base.group_system')
        for vals in vals_list:
            if not is_admin:
                vals['user_id'] = self.env.uid
                for forbidden in ('state', 'completed_at', 'last_picking_id', 'action_count'):
                    vals.pop(forbidden, None)
            if not vals.get('name') or vals.get('name') == _("New"):
                level = self.env['scale.up.game.level'].sudo().browse(vals.get('level_id'))
                user = self.env['res.users'].sudo().browse(vals.get('user_id') or self.env.uid)
                vals['name'] = "%s - %s" % (user.name, level.name or _("Game"))
        return super().create(vals_list)

    # ------------------------------------------------------------------
    # Public API called by the frontend
    # ------------------------------------------------------------------
    @api.model
    def get_or_create_session(self, level_code='restock_shelf'):
        """Return the current player's session state for a level (created if needed)."""
        level = self.env['scale.up.game.level'].search([('code', '=', level_code)], limit=1)
        if not level:
            raise UserError(_("This level is not available."))
        domain = [('user_id', '=', self.env.uid), ('level_id', '=', level.id)]
        session = self.search(domain, limit=1)
        if not session:
            try:
                with self.env.cr.savepoint():
                    session = self.create({'level_id': level.id, 'user_id': self.env.uid})
            except Exception:  # concurrent creation from another tab: reuse theirs
                session = self.search(domain, limit=1)
                if not session:
                    raise
        newly_completed = session._refresh_progress()
        return session._get_state_payload(newly_completed=newly_completed)

    def check_progress(self):
        """Re-evaluate the documents the player created (called by the game
        whenever the player comes back from the Odoo form)."""
        self.ensure_one()
        try:
            self._check_player_access()
            newly_completed = self._refresh_progress()
            return self._get_state_payload(newly_completed=newly_completed)
        except AccessError:
            return self._failure_payload(_("You don't have permission to perform this action."))
        except (UserError, ValidationError) as e:
            return self._failure_payload(str(e))

    def action_restock_shelf(self):
        """Execute the Level 1 scenario: a real internal transfer
        source -> destination, validated through the standard stock workflow.
        Returns a structured dict; expected failures never raise to the client."""
        self.ensure_one()
        try:
            self._check_player_access()
            with self.env.cr.savepoint():
                return self._do_restock_shelf()
        except AccessError:
            _logger.info("Scale-Up: access denied for user %s", self.env.uid, exc_info=True)
            return self._failure_payload(_("You don't have permission to perform this action."))
        except (UserError, ValidationError) as e:
            return self._failure_payload(str(e))
        except Exception:
            _logger.exception("Scale-Up: unexpected error while restocking the shelf")
            return self._failure_payload(_("Something went wrong. Please try again."))

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------
    def _check_player_access(self):
        self.check_access('read')
        if self.user_id != self.env.user and not self.env.user.has_group('base.group_system'):
            raise AccessError(_("This session belongs to another player."))

    def _do_restock_shelf(self):
        level = self.level_id
        # Serialise concurrent requests on the scenario and the session, then
        # re-read state: a second click/tab waits here and finds it completed.
        self.env.cr.execute("SELECT id FROM scale_up_game_level WHERE id = %s FOR UPDATE", (level.id,))
        self.env.cr.execute("SELECT id FROM scale_up_game_session WHERE id = %s FOR UPDATE", (self.id,))
        self.invalidate_recordset()
        level.invalidate_recordset()

        if self.state == 'completed':
            return self._get_state_payload(success=True, already_completed=True)
        if self.state != 'in_progress':
            raise UserError(_("This session is no longer active."))

        level._check_configuration()
        product, src, dst, qty = level.product_id, level.location_src_id, level.location_dest_id, level.quantity
        rounding = product.uom_id.rounding

        Quant = self.env['stock.quant']
        available = Quant._get_available_quantity(product, src, strict=True)
        if float_compare(available, qty, precision_rounding=rounding) < 0:
            raise UserError(_("There is no stock left in %(location)s to restock the shelf.",
                              location=src.complete_name))

        picking = self._create_and_validate_transfer(level)

        dst_qty = level._get_exact_quantity(dst)
        if picking.state != 'done' or float_compare(dst_qty, qty, precision_rounding=rounding) < 0:
            raise UserError(_("The transfer could not be completed."))

        # Game bookkeeping (own model, written with sudo because players only
        # have read/create rights on sessions).
        self.sudo().write({
            'state': 'completed',
            'completed_at': fields.Datetime.now(),
            'last_picking_id': picking.id,
            'action_count': self.action_count + 1,
        })
        return self._get_state_payload(success=True)

    def _create_and_validate_transfer(self, level):
        """Standard Odoo flow: create -> confirm -> assign -> mark picked -> validate.
        Runs with the player's own rights (no sudo)."""
        product, src, dst, qty = level.product_id, level.location_src_id, level.location_dest_id, level.quantity
        picking = self.env['stock.picking'].create({
            'picking_type_id': level._get_picking_type().id,
            'location_id': src.id,
            'location_dest_id': dst.id,
            'origin': _("Scale-Up! %s", level.name),
            'move_ids': [Command.create({
                'product_id': product.id,
                'product_uom_qty': qty,
                'product_uom': product.uom_id.id,
                'location_id': src.id,
                'location_dest_id': dst.id,
            })],
        })
        picking.action_confirm()
        picking.action_assign()
        if picking.state != 'assigned':
            raise UserError(_("The stock could not be reserved for this transfer."))
        picking.move_ids.picked = True
        result = picking.with_context(skip_backorder=True, skip_immediate=True).button_validate()
        if result is not True:
            raise UserError(_("The transfer needs manual validation and could not be completed automatically."))
        return picking

    # ------------------------------------------------------------------
    # Learning flow: the player creates the real Odoo document; the game only
    # observes how far it got.
    # ------------------------------------------------------------------
    def _check_picking(self, picking):
        """Compare a player-made transfer with what the scenario asks for."""
        level = self.level_id.sudo()
        product, src, dst, qty = level.product_id, level.location_src_id, level.location_dest_id, level.quantity
        rounding = product.uom_id.rounding
        issues = []
        moves = picking.move_ids.filtered(lambda m: m.product_id == product)
        if not picking.move_ids:
            issues.append(_("The transfer has no product line yet."))
        elif not moves:
            issues.append(_("This transfer doesn't move the product the order needs (%s).", product.display_name))
        else:
            amount = sum(moves.mapped('quantity' if picking.state == 'done' else 'product_uom_qty'))
            if float_compare(amount, qty, precision_rounding=rounding) < 0:
                issues.append(_("The quantity is too small: the order needs %s.", self._fmt_qty(qty)))
        if picking.location_id != src:
            issues.append(_("The source location should be %s.", src.complete_name))
        if picking.location_dest_id != dst:
            issues.append(_("The destination should be %s.", dst.complete_name))
        matches = not issues
        if matches and picking.state == 'confirmed':
            issues.append(_("There isn't enough stock in %s to reserve this transfer.", src.complete_name))
        return {'matches': matches, 'issues': issues}

    @staticmethod
    def _fmt_qty(qty):
        return str(int(qty)) if float(qty).is_integer() else str(qty)

    def _find_player_picking(self):
        """Best internal transfer made by the player since the session started."""
        Picking = self.env['stock.picking']
        candidates = Picking.search([
            ('create_uid', '=', self.user_id.id),
            ('create_date', '>=', self.started_at),
            ('picking_type_code', '=', 'internal'),
            ('state', '!=', 'cancel'),
        ], order='id desc', limit=10)
        best, best_info, best_key = Picking, {'matches': False, 'issues': []}, None
        for picking in candidates:
            info = self._check_picking(picking)
            rank = {'draft': 0, 'waiting': 1, 'confirmed': 1, 'assigned': 2, 'done': 3}.get(picking.state, 0)
            key = (info['matches'], rank, picking.id)
            if best_key is None or key > best_key:
                best, best_info, best_key = picking, info, key
        return best, best_info

    def _evaluate_progress(self):
        self.ensure_one()
        if self.state == 'completed' and self.last_picking_id:
            picking, info = self.last_picking_id, {'matches': True, 'issues': []}
        else:
            picking, info = self._find_player_picking()
        if picking and info['matches']:
            stage = {'done': 'done', 'assigned': 'ready'}.get(picking.state, 'draft')
        elif picking:
            stage = 'draft'
        else:
            stage = 'none'
        flags = [bool(picking), bool(picking) and info['matches'], stage in ('ready', 'done'), stage == 'done']
        labels = [
            _("Create an internal transfer"),
            _("Set the product, quantity and locations"),
            _("Mark it as To Do to reserve the stock"),
            _("Validate the transfer once the goods have moved"),
        ]
        keys = ['create', 'details', 'confirm', 'validate']
        steps = [{'key': k, 'label': lbl, 'done': d} for k, lbl, d in zip(keys, labels, flags)]
        return {'picking': picking, 'stage': stage, 'steps': steps, 'issues': info['issues']}

    def _refresh_progress(self):
        """Complete the session when a matching transfer is validated.
        Returns True only for the call that completes it."""
        if self.state != 'in_progress':
            return False
        progress = self._evaluate_progress()
        if progress['stage'] != 'done':
            return False
        level = self.level_id.sudo()
        rounding = level.product_id.uom_id.rounding
        if float_compare(level._get_exact_quantity(level.location_dest_id), level.quantity,
                         precision_rounding=rounding) < 0:
            return False
        self.env.cr.execute("SELECT id FROM scale_up_game_session WHERE id = %s FOR UPDATE", (self.id,))
        self.invalidate_recordset(['state'])
        if self.state != 'in_progress':
            return False
        self.sudo().write({
            'state': 'completed',
            'completed_at': fields.Datetime.now(),
            'last_picking_id': progress['picking'].id,
            'action_count': self.action_count + 1,
        })
        return True

    def _get_texts(self, level):
        qty = self._fmt_qty(level.quantity)
        shelf, src, dst = level.location_dest_id.name, level.location_src_id.complete_name, level.location_dest_id.complete_name
        product = level.product_id.display_name
        return {
            'objective': _(
                "Customer order SO-001 needs %(qty)s x %(product)s, but %(shelf)s is empty! "
                "The stock is in %(src)s. Get it onto the shelf the way a real warehouse does: "
                "with Odoo documents, not by hand.",
                qty=qty, product=product, shelf=shelf, src=src),
            'briefing': _("Boss, %(shelf)s is empty and a customer order is waiting! Can you sort out the stock?",
                          shelf=shelf),
            'hints': {
                'create': [
                    _("Goods that move inside the same warehouse need a document. Which Inventory document is that?"),
                    _("Use the Inventory terminal (the computer on the desk) and create a new Internal Transfer."),
                ],
                'details': [
                    _("Check every field: what are you moving, how much, from where, to where? "
                      "No Source/Destination Location fields? Enable 'Storage Locations' in "
                      "Inventory > Configuration > Settings, then reload."),
                    _("Add %(product)s x %(qty)s, from %(src)s to %(dst)s.", product=product, qty=qty, src=src, dst=dst),
                ],
                'confirm': [
                    _("A draft document doesn't reserve anything yet. Which button tells Odoo the transfer is planned?"),
                    _("Click 'Mark as To Do'. The stock gets reserved and the worker walks to the box."),
                ],
                'validate': [
                    _("The worker is ready to move the goods. Which button confirms they really moved?"),
                    _("Click 'Validate' on the transfer. Odoo then updates the stock of both locations."),
                ],
            },
        }

    def _get_state_payload(self, success=True, already_completed=False, message=None, newly_completed=False):
        """Compact structure for the frontend, built from real Odoo data."""
        self.ensure_one()
        level = self.level_id.sudo()
        picking = self.last_picking_id.sudo()
        progress = self._evaluate_progress()
        current = progress['picking'].sudo()
        return {
            **self._get_texts(level),
            'newly_completed': newly_completed,
            'stage': progress['stage'],
            'steps': progress['steps'],
            'issues': progress['issues'],
            'current_picking_id': current.id or False,
            'current_picking_name': current.name or False,
            'picking_type_id': level._get_picking_type().id,
            'success': success,
            'action': 'restock_shelf',
            'message': message or '',
            'already_completed': already_completed,
            'session_id': self.id,
            'level_code': level.code,
            'level_name': level.name,
            'level_description': level.description or '',
            'session_state': self.state,
            'transfer_state': picking.state if picking else False,
            'product_name': level.product_id.display_name,
            'quantity_transferred': level.quantity if picking else 0,
            'transfer_quantity': level.quantity,
            'source_location': level.location_src_id.complete_name,
            'destination_location': level.location_dest_id.complete_name,
            'source_quantity': level._get_exact_quantity(level.location_src_id),
            'destination_quantity': level._get_exact_quantity(level.location_dest_id),
            'picking_id': picking.id if picking else False,
            'picking_name': picking.name if picking else False,
            'action_count': self.action_count,
        }

    def _failure_payload(self, message):
        try:
            return self._get_state_payload(success=False, message=message)
        except Exception:  # e.g. the player cannot even read this session
            return {'success': False, 'action': 'restock_shelf', 'message': message}
