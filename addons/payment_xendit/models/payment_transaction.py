# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging

from odoo import _, models
from odoo.exceptions import ValidationError

from odoo.addons.payment_xendit import const


_logger = logging.getLogger(__name__)


class PaymentTransaction(models.Model):
    _inherit = 'payment.transaction'

    def _get_tx_from_notification_data(self, provider_code, notification_data):
        """ Override of `payment` to find the transaction based on the notification data.

        :param str provider_code: The code of the provider that handled the transaction.
        :param dict notification_data: The notification data sent by the provider.
        :return: The transaction if found.
        :rtype: payment.transaction
        :raise ValidationError: If inconsistent data were received.
        :raise ValidationError: If the data match no transaction.
        """
        tx = super()._get_tx_from_notification_data(provider_code, notification_data)
        if provider_code != 'xendit' or len(tx) == 1:
            return tx

        reference = notification_data.get('external_id')
        if not reference:
            raise ValidationError("Xendit: " + _("Received data with missing reference."))

        tx = self.search([('reference', '=', reference), ('provider_code', '=', 'xendit')])
        if not tx:
            raise ValidationError(
                "Xendit: No transaction found matching reference %s." % reference
            )
        return tx

    def _process_notification_data(self, notification_data):
        """ Override of `payment` to process the transaction based on Xendit data.

        Depending on the data, get the status from data and update status of transaction accordingly
        If payment is done through credit card on the payment page, notification_data should include 'credit_card_token' information,
        which we will store internally and used for charges in the future

        Note: self.ensure_one()

        :param dict notification_data: The notification data sent by the provider.
        :return: None
        :raise ValidationError: If inconsistent data were received.
        """
        self.ensure_one()

        super()._process_notification_data(notification_data)
        if self.provider_code != 'xendit':
            return

        # Update the provider reference.
        # TODO NNI just do: self.provider_reference = notification_data.get('id')

        # Update the payment state.
        # payment status is either PAID or EXPIRED
        payment_status = notification_data.get('status')
        if not self.provider_reference and payment_status in (const.PAYMENT_STATUS_MAPPING['done'] + const.PAYMENT_STATUS_MAPPING['pending'] + const.PAYMENT_STATUS_MAPPING['authorized']) and notification_data.get('id'):
            self.provider_reference = notification_data.get('id')

        if payment_status in const.PAYMENT_STATUS_MAPPING['done']:
            if self.tokenize and notification_data.get('credit_card_token'):
                self._xendit_tokenize_notification_data(notification_data)
            self._set_done()
        elif payment_status in const.PAYMENT_STATUS_MAPPING['pending']:
            self._set_pending()
        elif payment_status in const.PAYMENT_STATUS_MAPPING['authorized']:
            self._set_authorized()
        elif payment_status in const.PAYMENT_STATUS_MAPPING['cancel']:
            self._set_canceled()
        elif payment_status in const.PAYMENT_STATUS_MAPPING['error']:
            self._set_error()
