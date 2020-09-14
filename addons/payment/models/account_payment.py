# Part of Odoo. See LICENSE file for full copyright and licensing details.

import datetime

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError

# TODO ANV clean

class AccountPayment(models.Model):
    _inherit = 'account.payment'

    payment_transaction_id = fields.Many2one('payment.transaction', string='Payment Transaction', readonly=True)
    payment_token_id = fields.Many2one(
        'payment.token', string="Saved payment token",
        domain="""[
            (payment_method_code == 'electronic', '=', 1),
            ('company_id', '=', company_id),
            ('acquirer_id.capture_manually', '=', False),
            ('acquirer_id.journal_id', '=', journal_id),
            ('partner_id', 'in', related_partner_ids),
        ]""",
        help="Note that tokens from acquirers set to only authorize transactions (instead of capturing the amount) are not available.")
    related_partner_ids = fields.Many2many('res.partner', compute='_compute_related_partners')

    def _get_payment_chatter_link(self):
        self.ensure_one()
        return '<a href=# data-oe-model=account.payment data-oe-id=%d>%s</a>' % (self.id, self.name)

    @api.depends('partner_id.commercial_partner_id.child_ids')
    def _compute_related_partners(self):
        for p in self:
            p.related_partner_ids = (
                p.partner_id
              | p.partner_id.commercial_partner_id
              | p.partner_id.commercial_partner_id.child_ids
            )._origin

    @api.onchange('partner_id', 'payment_method_id', 'journal_id')
    def _onchange_set_payment_token_id(self):
        if not (self.payment_method_code == 'electronic' and self.partner_id and self.journal_id):
            self.payment_token_id = False
            return

        self.payment_token_id = self.env['payment.token'].search([
            ('partner_id', 'in', self.related_partner_ids.ids),
            ('acquirer_id.capture_manually', '=', False),
            ('acquirer_id.journal_id', '=', self.journal_id.id),
         ], limit=1)

    def _prepare_payment_transaction_vals(self):  # TODO ANV double check values
        self.ensure_one()
        return {
            'amount': self.amount,
            'currency_id': self.currency_id.id,
            'partner_id': self.partner_id.id,
            'partner_country_id': self.partner_id.country_id.id,
            'invoice_ids': [(6, 0, self.invoice_ids.ids)],
            'token_id': self.payment_token_id.id,
            'acquirer_id': self.payment_token_id.acquirer_id.id,
            'payment_id': self.id,
            'operation': 'offline',
        }

    def _create_payment_transaction(self, vals=None):
        for pay in self:
            if pay.payment_transaction_id:
                raise ValidationError(_('A payment transaction already exists.'))
            elif not pay.payment_token_id:
                raise ValidationError(_('A token is required to create a new payment transaction.'))

        transactions = self.env['payment.transaction']
        for pay in self:
            transaction_vals = pay._prepare_payment_transaction_vals()

            if vals:
                transaction_vals.update(vals)

            transaction = self.env['payment.transaction'].create(transaction_vals)
            transactions += transaction

            # Link the transaction to the payment.
            pay.payment_transaction_id = transaction

        return transactions

    def action_post(self):
        # Post the payments "normally" if no transactions are needed.
        # If not, let the acquirer updates the state.

        payments_need_trans = self.filtered(lambda pay: pay.payment_token_id and not pay.payment_transaction_id)
        transactions = payments_need_trans._create_payment_transaction()

        res = super(AccountPayment, self - payments_need_trans).action_post()

        transactions._send_payment_request()

        return res
