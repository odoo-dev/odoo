# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models

FINAL_STATES = ('success', 'failed', 'cancelled', 'timeout')


class PosPaymentAttempt(models.Model):
    _name = 'pos.payment.attempt'
    _description = "Point of Sale Terminal Transaction"
    _order = 'id desc'
    _rec_name = 'transaction_id'

    transaction_id = fields.Char(string="Transaction ID", required=True, readonly=True, index=True)
    pos_order_id = fields.Many2one('pos.order', string="Order", readonly=True, index='btree_not_null', ondelete='set null')
    payment_method_id = fields.Many2one('pos.payment.method', string="Payment Method", required=True, readonly=True, ondelete='cascade')
    company_id = fields.Many2one(related='payment_method_id.company_id', store=True)
    amount = fields.Float(readonly=True)
    state = fields.Selection(
        selection=[
            ('initiated', "Initiated"),
            ('processing', "Processing"),
            ('success', "Success"),
            ('failed', "Failed"),
            ('cancelled', "Cancelled"),
            ('timeout', "Timed Out"),
        ],
        required=True, default='initiated', readonly=True,
    )
    message = fields.Char(readonly=True, help="Last message from the provider, e.g. the decline reason.")

    _unique_transaction = models.Constraint(
        'unique (payment_method_id, transaction_id)',
        "A transaction is logged once per payment method.",
    )
