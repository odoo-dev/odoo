# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
from datetime import timedelta
from uuid import uuid4

from odoo import _, api, fields, models
from odoo.exceptions import UserError
from odoo.tools import float_round

_logger = logging.getLogger(__name__)

OPEN_STATES = ('initiated', 'processing', 'unknown')
FINAL_STATES = ('success', 'failed', 'cancelled', 'timeout', 'force_done', 'force_cancelled')
FORCED_STATES = ('force_done', 'force_cancelled')
TRUSTED_SOURCES = ('server', 'cron')
STATE_SELECTION = [
    ('initiated', "Initiated"),
    ('processing', "Processing"),
    ('unknown', "Unknown"),
    ('success', "Success"),
    ('failed', "Failed"),
    ('cancelled', "Cancelled"),
    ('timeout', "Timed Out"),
    ('force_done', "Forced as Paid"),
    ('force_cancelled', "Forced as Cancelled"),
]
STATE_RANK = {'initiated': 0, 'processing': 1, 'unknown': 2}
DEFAULT_STALE_MINUTES = 15

# Values the POS may send; anything else in the payload is ignored.
UI_FIELDS = (
    'name', 'order_uuid', 'payment_uuid', 'amount', 'card_no', 'card_brand',
    'authcode', 'error_message',
)


class PosPaymentAttempt(models.Model):
    _name = 'pos.payment.attempt'
    _description = "Point of Sale Payment Attempt"
    _order = 'date_start desc, id desc'

    uuid = fields.Char(required=True, readonly=True, copy=False, index=True)
    name = fields.Char(string="Transaction Reference", readonly=True, index='btree_not_null',
        help="Reference of the transaction at the payment provider.")
    state = fields.Selection(
        selection=STATE_SELECTION,
        required=True, default='initiated', readonly=True, index=True,
    )
    is_open = fields.Boolean(compute='_compute_is_open', search='_search_is_open')
    reviewed = fields.Boolean(readonly=True,
        help="An open or unknown attempt that a cashier has seen and chosen not to recover.")

    order_uuid = fields.Char(readonly=True, index='btree_not_null')
    payment_uuid = fields.Char(readonly=True, index='btree_not_null')
    pos_order_id = fields.Many2one('pos.order', string="Order", readonly=True, index='btree_not_null', ondelete='set null')
    pos_payment_id = fields.Many2one('pos.payment', string="Payment", readonly=True, index='btree_not_null', ondelete='set null')
    payment_method_id = fields.Many2one('pos.payment.method', string="Payment Method", required=True, readonly=True, ondelete='restrict')
    payment_provider = fields.Selection(related='payment_method_id.payment_provider', store=True, string="Provider")
    session_id = fields.Many2one('pos.session', string="Session", readonly=True, index='btree_not_null', ondelete='set null')
    config_id = fields.Many2one('pos.config', related='session_id.config_id', store=True, string="Point of Sale")
    company_id = fields.Many2one('res.company', required=True, readonly=True, index=True,
        default=lambda self: self.env.company)
    currency_id = fields.Many2one('res.currency', readonly=True)
    user_id = fields.Many2one('res.users', string="Cashier", readonly=True, default=lambda self: self.env.user)

    amount = fields.Monetary(readonly=True, currency_field='currency_id')
    date_start = fields.Datetime(string="Started", readonly=True, default=fields.Datetime.now)
    date_end = fields.Datetime(string="Ended", readonly=True)
    date_last_update = fields.Datetime(string="Last Update", readonly=True, default=fields.Datetime.now)
    error_message = fields.Char(readonly=True)
    card_no = fields.Char(string="Card Number (Last 4 Digits)", readonly=True)
    card_brand = fields.Char(readonly=True)
    authcode = fields.Char(string="Authorization Code", readonly=True)

    event_ids = fields.One2many('pos.payment.attempt.event', 'attempt_id', string="Timeline", readonly=True)

    _unique_uuid = models.Constraint('unique (uuid)', "A payment attempt with this uuid already exists.")

    @api.depends('state')
    def _compute_is_open(self):
        for attempt in self:
            attempt.is_open = attempt.state in OPEN_STATES

    def _search_is_open(self, operator, value):
        if operator != 'in':
            return NotImplemented
        if True in value and False in value:
            return []
        return [('state', 'in' if True in value else 'not in', OPEN_STATES)]

    @api.ondelete(at_uninstall=False)
    def _unlink_except_open(self):
        if any(attempt.state in OPEN_STATES for attempt in self):
            raise UserError(_("Payment attempts that are still open cannot be deleted."))

    # -------------------------------------------------------------------------
    # State machine
    # -------------------------------------------------------------------------

    @api.model
    def _is_allowed_transition(self, old_state, new_state, source):
        if not new_state or old_state == new_state:
            return False
        if old_state in OPEN_STATES:
            # The provider's word wins over the order in which POS messages arrive.
            return (
                new_state in FINAL_STATES
                or STATE_RANK[new_state] > STATE_RANK[old_state]
                or source in TRUSTED_SOURCES
            )
        # A final state only changes when the cashier forces a failed attempt, or when the
        # provider reports later that a closed attempt was actually paid.
        if new_state == 'success':
            return source in TRUSTED_SOURCES
        return new_state in FORCED_STATES and old_state != 'success'

    def _log_event(self, state=None, source='pos', message=None, payload=None, values=None, skip_if_unchanged=False):
        """Apply a status update to the attempt and append it to the timeline.

        :param state: new state; it is ignored when it would move the attempt backwards
        :param source: ``pos``, ``server`` or ``cron``
        :param payload: raw provider data, kept on the event for managers
        :param values: other attempt fields to update (card data, reference, ...)
        :param skip_if_unchanged: don't add an event when nothing changed (e.g. status polling)
        """
        self.ensure_one()
        values = {key: value for key, value in (values or {}).items() if value not in (None, False, '')}
        changes = {key: value for key, value in values.items() if self[key] != value}
        state_changed = self._is_allowed_transition(self.state, state, source)
        if skip_if_unchanged and not state_changed and not changes and not message:
            return False

        now = fields.Datetime.now()
        if state_changed:
            changes['state'] = state
            if state in FINAL_STATES:
                changes['date_end'] = now
        changes['date_last_update'] = now
        self.write(changes)
        # sudo: the payload is restricted to managers but every POS user writes the timeline.
        self.env['pos.payment.attempt.event'].sudo().create({
            'attempt_id': self.id,
            'state': state or self.state,
            'state_applied': state_changed or state in (None, self.state),
            'source': source,
            'message': message,
            'payload': payload,
        })
        return state_changed

    # -------------------------------------------------------------------------
    # Upsert
    # -------------------------------------------------------------------------

    @api.model
    def _prepare_values_from_ui(self, vals):
        values = {key: vals[key] for key in UI_FIELDS if key in vals}
        if vals.get('transaction_id'):
            values['name'] = vals['transaction_id']
        return values

    @api.model
    def _create_attempt(self, attempt_uuid, payment_method, values, session=None):
        session = session or self.env['pos.session']
        order = self.env['pos.order']
        if values.get('order_uuid'):
            order = order.search([('uuid', '=', values['order_uuid'])], limit=1)
        session = session or order.session_id
        currency = order.currency_id or session.currency_id or payment_method.company_id.currency_id
        return self.create({
            **values,
            'uuid': attempt_uuid,
            'payment_method_id': payment_method.id,
            'session_id': session.id,
            'pos_order_id': order.id,
            'company_id': (session.company_id or payment_method.company_id or self.env.company).id,
            'currency_id': currency.id,
            'amount': float_round(values.get('amount') or 0.0, precision_digits=currency.decimal_places),
        })

    @api.model
    def _upsert(self, attempt_uuid, payment_method, state=None, source='pos', message=None,
                payload=None, values=None, session=None, skip_if_unchanged=False):
        values = dict(values or {})
        attempt = self.search([('uuid', '=', attempt_uuid)], limit=1) if attempt_uuid else self.browse()
        if not attempt and values.get('name'):
            attempt = self.search([
                ('payment_method_id', '=', payment_method.id),
                ('name', '=', values['name']),
            ], order='id desc', limit=1)
        if not attempt:
            attempt = self._create_attempt(attempt_uuid or str(uuid4()), payment_method, values, session)
            skip_if_unchanged = False
        attempt._log_event(state=state, source=source, message=message, payload=payload,
            values={k: v for k, v in values.items() if k != 'amount'}, skip_if_unchanged=skip_if_unchanged)
        if session and not attempt.session_id:
            attempt.session_id = session
        attempt._link_records()
        return attempt

    def _link_records(self):
        for attempt in self:
            if not attempt.pos_order_id and attempt.order_uuid:
                order = self.env['pos.order'].search([('uuid', '=', attempt.order_uuid)], limit=1)
                if order:
                    attempt.write({'pos_order_id': order.id, 'session_id': attempt.session_id.id or order.session_id.id})
            if not attempt.pos_payment_id and attempt.payment_uuid and attempt.state in ('success', 'force_done'):
                payment = self.env['pos.payment'].search([('uuid', '=', attempt.payment_uuid)], limit=1)
                if payment:
                    attempt.pos_payment_id = payment

    @api.model
    def log_attempts_from_ui(self, vals_list):
        """Entry point of the POS: create or update attempts, in the order they were sent.

        Each item needs ``uuid``, ``payment_method_id`` and ``state``. Replaying a call is harmless:
        states never move backwards, so an item that arrives late doesn't undo a newer one.
        """
        result = []
        for vals in vals_list:
            payment_method = self.env['pos.payment.method'].browse(vals.get('payment_method_id')).exists()
            if not vals.get('uuid') or not payment_method:
                _logger.warning("Ignoring payment attempt without uuid or valid payment method: %s", vals)
                continue
            session = self.env['pos.session'].browse(vals.get('session_id')).exists()
            attempt = self._upsert(
                vals['uuid'], payment_method,
                state=vals.get('state'),
                source='pos',
                message=vals.get('message'),
                values=self._prepare_values_from_ui(vals),
                session=session,
            )
            result.append({'uuid': attempt.uuid, 'state': attempt.state})
        return result

    # -------------------------------------------------------------------------
    # Recovery
    # -------------------------------------------------------------------------

    def _read_for_ui(self):
        return [{
            'id': attempt.id,
            'uuid': attempt.uuid,
            'name': attempt.name or '',
            'state': attempt.state,
            'state_label': dict(self._fields['state']._description_selection(self.env))[attempt.state],
            'payment_uuid': attempt.payment_uuid,
            'payment_method_id': attempt.payment_method_id.id,
            'payment_method_name': attempt.payment_method_id.name,
            'amount': attempt.amount,
            'date_start': fields.Datetime.to_string(attempt.date_start),
            'error_message': attempt.error_message or '',
            'card_no': attempt.card_no or '',
            'card_brand': attempt.card_brand or '',
            'authcode': attempt.authcode or '',
            'has_payment': bool(attempt.pos_payment_id),
        } for attempt in self]

    @api.model
    def get_attempts_to_recover(self, order_uuid):
        """Attempts of the order that may have charged the customer without a recorded payment."""
        attempts = self.search([
            ('order_uuid', '=', order_uuid),
            ('reviewed', '=', False),
            '|',
            ('state', 'in', OPEN_STATES),
            '&', ('state', 'in', ('success', 'force_done')), ('pos_payment_id', '=', False),
        ])
        return attempts._read_for_ui()

    def action_check_status(self):
        """Ask the provider for the real status of open attempts."""
        for attempt in self.filtered(lambda a: a.state in OPEN_STATES and a.name):
            try:
                with self.env.cr.savepoint():
                    attempt.payment_method_id._payment_attempt_check_status(attempt)
            except Exception as error:  # noqa: BLE001 - a provider error must not block the others
                _logger.warning("Checking payment attempt %s failed: %s", attempt.uuid, error)
                attempt._log_event(source='server', message=_("Status check failed: %s", error))
        return True

    def check_status_from_ui(self):
        self.action_check_status()
        return self._read_for_ui()

    def mark_reviewed_from_ui(self, message=None):
        for attempt in self:
            attempt.reviewed = True
            new_state = 'unknown' if attempt.state in OPEN_STATES else None
            attempt._log_event(state=new_state, source='pos',
                message=message or _("Reviewed by the cashier without recovering the payment."))
        return self._read_for_ui()

    def action_mark_reviewed(self):
        self.mark_reviewed_from_ui(_("Reviewed from the backend."))
        return True

    @api.model
    def _cron_check_stale_attempts(self):
        minutes = self.env['ir.config_parameter'].sudo().get_int(
            'pos_payment_attempt.stale_minutes', DEFAULT_STALE_MINUTES)
        stale = self.search([
            ('state', 'in', ('initiated', 'processing')),
            ('date_last_update', '<', fields.Datetime.now() - timedelta(minutes=minutes)),
        ])
        stale.action_check_status()
        for attempt in stale.filtered(lambda a: a.state in ('initiated', 'processing')):
            attempt._log_event(state='unknown', source='cron',
                message=_("No update for %s minutes; the outcome is unknown.", minutes))
