# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, tools


class EventEvent(models.Model):
    _inherit = 'event.event'

    allow_transfer = fields.Boolean(
        "Allow Ticket Transfer", compute='_compute_transfer_policy',
        precompute=True, readonly=False, store=True)
    transfer_deadline_hours = fields.Integer(
        "Transfer Lockout (Hours)", compute='_compute_transfer_policy',
        precompute=True, readonly=False, store=True,
        help="Transfers are closed this many hours before the event (or slot) starts. "
             "0 allows transfers until the event starts.")
    transfer_limit = fields.Integer(
        "Max Transfers per Ticket", compute='_compute_transfer_policy',
        precompute=True, readonly=False, store=True,
        help="Maximum number of completed transfers per ticket. 0 means unlimited.")
    transfer_expiry_hours = fields.Integer(
        "Transfer Link Validity (Hours)", compute='_compute_transfer_policy',
        precompute=True, readonly=False, store=True,
        help="Pending transfers expire after this many hours. 0 keeps them valid until the transfer lockout.")
    allow_transfer_return = fields.Boolean(
        "Allow Return to Sender", compute='_compute_transfer_policy',
        precompute=True, readonly=False, store=True,
        help="The recipient of a transfer may give the ticket back to its sender.")

    _transfer_deadline_hours_positive = models.Constraint(
        'CHECK(transfer_deadline_hours >= 0)',
        "The transfer lockout cannot be negative.",
    )
    _transfer_limit_positive = models.Constraint(
        'CHECK(transfer_limit >= 0)',
        "The maximum number of transfers cannot be negative.",
    )
    _transfer_expiry_hours_positive = models.Constraint(
        'CHECK(transfer_expiry_hours >= 0)',
        "The transfer link validity cannot be negative.",
    )

    @api.depends('event_type_id')
    def _compute_transfer_policy(self):
        """ Copy the transfer policy from the event template, emulating an
        onchange: only a change of template updates the configuration. """
        for event in self:
            source = event.event_type_id or event
            for fname in self._get_transfer_policy_fields():
                event[fname] = source[fname]

    @api.model
    def _get_transfer_policy_fields(self):
        return [
            'allow_transfer', 'transfer_deadline_hours', 'transfer_limit',
            'transfer_expiry_hours', 'allow_transfer_return',
        ]

    def _get_tickets_access_hash(self, registration_ids):
        """ Include the barcode of transferred tickets in the hash: download
        links sent to a previous owner must not give access to the new ticket.
        Tickets that were never transferred keep their original links. """
        registrations = self.env['event.registration'].sudo().browse(registration_ids).exists()
        transferred = registrations.filtered(
            lambda registration: any(t.state in ('accepted', 'returned') for t in registration.transfer_ids))
        if not transferred:
            return super()._get_tickets_access_hash(registration_ids)
        self.ensure_one()
        return tools.hmac(
            self.env(su=True), 'event-registration-ticket-report-access',
            (self.id, sorted(registration_ids), sorted(transferred.mapped('barcode'))),
        )
