from odoo import SUPERUSER_ID, Command, _, api, fields, models
from odoo.exceptions import UserError
from odoo.tools import float_compare


# Cast members that exist as 3D characters (see static/src/three/kit/people.js).
# Other `who` keys of a chat line ("phone", "mail", "doc") are narration.
PEOPLE = ('ceo', 'marc', 'sophia', 'paul', 'anita', 'brandon', 'roger', 'driver', 'worker')


class ScaleUpGameScenario(models.AbstractModel):
    """Base class of a playable sub-level.

    A scenario lives in an abstract model named ``scale.up.game.scenario.<code>``
    (``<code>`` = ``scale.up.game.level.scenario``). It knows how to seed the
    prerequisites of its sub-level, how to evaluate the documents the player
    created, and what to tell the player. It never performs the business
    action itself: Odoo documents are always created by the player.
    """
    _name = 'scale.up.game.scenario'
    _description = 'Scale-Up Scenario (base)'

    answer_label = None  # set to ask the player to type an answer

    # ------------------------------------------------------------------
    # To override
    # ------------------------------------------------------------------
    def _steps(self):
        """[(key, label)] in order."""
        raise NotImplementedError

    def _setup(self, session):
        """Seed what the player needs (sudo). Return a dict kept in session.data."""
        return {}

    def _evaluate(self, session):
        """Return {'stage': none|draft|ready|done, 'flags': [bool per step], 'issues': [str]}."""
        raise NotImplementedError

    def _texts(self, session):
        """Return {'objective', 'briefing', 'chat', 'hints', 'recap'}.

        A chat line is {'who': <cast key>, 'text': ...}; the player clicks
        through them one by one when the attempt starts.
        """
        raise NotImplementedError

    def _terminal(self, session, ev):
        """Menu entries of the office terminal: [{'label', 'alt', 'action'}]."""
        return []

    def _scene(self, session, ev):
        """Visual state for the 3D scene (confirmed data only)."""
        return {}

    def _panel(self, session, ev):
        """Rows of the mission card info panel: [{'label', 'value'}]."""
        return []

    def _cast(self, session):
        """Characters standing in the scene: whoever speaks, the player first."""
        keys = ['ceo'] + [line['who'] for line in self._texts(session)['chat']]
        seen = []
        for key in keys:
            if key in PEOPLE and key not in seen:
                seen.append(key)
        return [{'key': key} for key in seen]

    def _bonus(self, session):
        return 0

    def _submit(self, session, value):
        raise UserError(_("This level doesn't expect an answer."))

    # ------------------------------------------------------------------
    # Generic engine
    # ------------------------------------------------------------------
    def _evaluate_state(self, session):
        if session.state == 'completed':
            return {'stage': 'done', 'flags': [True] * len(self._steps()), 'issues': []}
        return self._evaluate(session)

    def _refresh(self, session):
        """Complete the session when the evaluation is done. True only for the call that completes it."""
        if session.state != 'in_progress':
            return False
        if self._evaluate(session)['stage'] != 'done':
            return False
        self.env.cr.execute("SELECT id FROM scale_up_game_session WHERE id = %s FOR UPDATE", (session.id,))
        session.invalidate_recordset(['state'])
        if session.state != 'in_progress':
            return False
        level = session.level_id.sudo()
        stars = 2 - (1 if session.max_hint >= 2 else 0) + self._bonus(session)
        session.sudo().write({
            'state': 'completed',
            'completed_at': fields.Datetime.now(),
            'stars': min(stars, level.max_stars),
            'action_count': session.action_count + 1,
        })
        return True

    def _payload(self, session, success=True, message=None, newly_completed=False):
        session.ensure_one()
        level = session.level_id.sudo()
        ev = self._evaluate_state(session)
        steps = [{'key': k, 'label': label, 'done': done} for (k, label), done in zip(self._steps(), ev['flags'])]
        return {
            **self._texts(session),
            'success': success,
            'message': message or '',
            'session_id': session.id,
            'level_code': level.code,
            'level_name': level.name,
            'group_name': level.parent_id.name or '',
            'scenario': level.scenario,
            'scene_key': level.scene,
            'stage': ev['stage'],
            'steps': steps,
            'issues': ev['issues'],
            'terminal': {'items': self._terminal(session, ev)},
            'panel': self._panel(session, ev),
            'cast': self._cast(session),
            'scene': self._scene(session, ev),
            'answer': {'label': self.answer_label} if self.answer_label and ev['stage'] != 'done' else None,
            'newly_completed': newly_completed,
            'session_state': session.state,
            'stars': session.stars,
            'max_stars': level.max_stars,
        }

    # ------------------------------------------------------------------
    # Helpers shared by scenarios
    # ------------------------------------------------------------------
    @staticmethod
    def _eq(a, b):
        return float_compare(a, b, precision_digits=2) == 0

    @staticmethod
    def _fmt(qty):
        return str(int(qty)) if float(qty).is_integer() else str(qty)

    def _act_form(self, model, name, res_id=False, context=None):
        action = {
            'type': 'ir.actions.act_window', 'name': name, 'res_model': model,
            'views': [[False, 'form']], 'target': 'new', 'context': context or {},
        }
        if res_id:
            action['res_id'] = res_id
        return action

    def _item_new(self, label, model, context=None):
        return {'label': label, 'alt': False, 'action': self._act_form(model, label, context=context)}

    def _item_open(self, label, model, record):
        return {'label': label, 'alt': True, 'action': self._act_form(model, record.display_name or label, record.id)}

    def _player_records(self, session, model, domain=()):
        """Records of `model` created by the player during this attempt."""
        return self.env[model].sudo().search([
            ('create_uid', '=', session.user_id.id),
            ('create_date', '>=', session.started_at),
            *domain,
        ], order='id desc', limit=10)

    def _best(self, records, check, rank=lambda r: 0):
        """Pick the record closest to the target: (record, issues, matches)."""
        best, best_key = None, None
        for rec in records:
            issues = check(rec)
            key = (not issues, rank(rec), rec.id)
            if best_key is None or key > best_key:
                best, best_key = (rec, issues), key
        return (best[0], best[1], not best[1]) if best else (None, [], False)

    # --- fixtures --------------------------------------------------------
    def _vendor(self):
        return self.env.ref('scale_up_game.partner_wood_corner').sudo()

    def _customer(self):
        return self.env.ref('scale_up_game.partner_azure_brandon').sudo()

    def _is_customer(self, partner):
        customer = self._customer()
        return partner in (customer, customer.commercial_partner_id) or partner.commercial_partner_id == customer.commercial_partner_id

    def _desk(self):
        return self.env.ref('scale_up_game.product_large_desk').sudo().product_variant_id

    @staticmethod
    def _is_desk(product):
        return 'desk' in (product.name or '').lower()

    # --- seeding (superuser: records are owned by OdooBot, never by the player) ---
    def _seed_purchase(self, receive=False, bill=False):
        env = self.env(user=SUPERUSER_ID)
        po = env['purchase.order'].create({
            'partner_id': self._vendor().id,
            'order_line': [Command.create({
                'product_id': self._desk().id, 'product_qty': 10, 'price_unit': 100.0})],
        })
        po.button_confirm()
        if receive:
            self._validate_picking(po.picking_ids)
        if bill:
            po.action_create_invoice()
            invoice = po.invoice_ids
            invoice.invoice_date = fields.Date.context_today(self)
            invoice.action_post()
        return po

    def _seed_sale(self, deliver=False, invoice=False, pay=False):
        env = self.env(user=SUPERUSER_ID)
        so = env['sale.order'].create({
            'partner_id': self._customer().id,
            'order_line': [Command.create({
                'product_id': self._desk().id, 'product_uom_qty': 3, 'price_unit': 220.0})],
        })
        so.action_confirm()
        if deliver:
            self._validate_picking(so.picking_ids)
        if invoice:
            inv = so._create_invoices()
            inv.action_post()
            if pay:
                env['account.payment.register'].with_context(
                    active_model='account.move', active_ids=inv.ids).create({}).action_create_payments()
        return so

    def _validate_picking(self, picking):
        picking = picking.sudo()
        picking.action_assign()
        picking.move_ids.picked = True
        picking.with_context(skip_backorder=True).button_validate()
        if picking.state != 'done':
            raise UserError(_("Could not prepare the scenario (transfer %s).", picking.name))

    def _desk_on_hand(self):
        warehouse = self.env['stock.warehouse'].sudo().search([], limit=1)
        return self._desk().with_context(location=warehouse.lot_stock_id.id).qty_available

    def _scene_stock(self):
        return {'stock': self._desk_on_hand()}
