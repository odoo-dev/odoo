# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models

from .pos_payment_attempt import STATE_SELECTION


class PosPaymentAttemptEvent(models.Model):
    _name = 'pos.payment.attempt.event'
    _description = "Point of Sale Payment Attempt Event"
    _order = 'id'

    attempt_id = fields.Many2one('pos.payment.attempt', required=True, index=True, ondelete='cascade')
    company_id = fields.Many2one(related='attempt_id.company_id', store=True)
    create_date = fields.Datetime(string="Date", readonly=True)
    state = fields.Selection(selection=STATE_SELECTION, readonly=True)
    state_applied = fields.Boolean(string="Applied", readonly=True,
        help="Unchecked when the reported state was older than the attempt's state and was ignored.")
    source = fields.Selection(
        selection=[('pos', "Point of Sale"), ('server', "Provider (server)"), ('cron', "Scheduled Check")],
        required=True, readonly=True,
    )
    message = fields.Char(readonly=True)
    payload = fields.Json(readonly=True, groups='point_of_sale.group_pos_manager')
