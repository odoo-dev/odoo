# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class EventType(models.Model):
    _inherit = 'event.type'

    allow_transfer = fields.Boolean("Allow Ticket Transfer")
    transfer_deadline_hours = fields.Integer(
        "Transfer Lockout (Hours)", default=24,
        help="Transfers are closed this many hours before the event (or slot) starts. "
             "0 allows transfers until the event starts.")
    transfer_limit = fields.Integer(
        "Max Transfers per Ticket", default=1,
        help="Maximum number of completed transfers per ticket. 0 means unlimited.")
    transfer_expiry_hours = fields.Integer(
        "Transfer Link Validity (Hours)", default=48,
        help="Pending transfers expire after this many hours. 0 keeps them valid until the transfer lockout.")
    allow_transfer_return = fields.Boolean(
        "Allow Return to Sender", default=True,
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
