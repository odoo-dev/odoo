# coding: utf-8
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging

from odoo import api, models

from odoo.addons.payment import utils as payment_utils

_logger = logging.getLogger(__name__)


class PaymentTransaction(models.Model):
    _inherit = 'payment.transaction'

    def _send_payment_request(self):
        """ Override of payment to simulate a payment request. """
        super()._send_payment_request()  # Log the 'sent' message
        if self.acquirer_id.provider != 'test':
            return

        # The payment request response would normally transit through the controller but in the end,
        # all that interests us is the reference. To avoid making a localhost request, we bypass the
        # controller and handle the fake feedback data directly.
        self._handle_feedback_data('test', {'reference': self.reference})

    @api.model
    def _get_tx_from_feedback_data(self, provider, data):
        """ Find the transaction based on the feedback data.

        :param str provider: The provider of the acquirer that handled the transaction
        :param dict data: The feedback data sent by the provider
        :return: The transaction if found
        :rtype: recordset of `payment.transaction`
        """
        if provider != 'test':
            return super()._get_tx_from_feedback_data(provider, data)
        return self.env['payment.transaction'].search([('reference', '=', data.get('reference'))])

    def _process_feedback_data(self, data):
        if self.provider != "test":
            return super()._process_feedback_data(data)

        self._set_done()  # Fake transactions are always successful

        if self.tokenize:
            cc_number = payment_utils.build_token_name(payment_details_short=data['cc_summary'])
            token = self.env['payment.token'].create({
                'name': f"TEST {cc_number}",
                'partner_id': self.partner_id.id,
                'acquirer_id': self.acquirer_id.id,
                'acquirer_ref': 'fake acquirer reference',
                'verified': True,
            })
            self.token_id = token.id
