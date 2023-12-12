# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging

from werkzeug import urls
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

        Update the payment state of transaction based on the notification data that contains status information

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
        # payment status is either PAID, EXPIRED, CANCELLED, or FAILED
        payment_status = notification_data.get('status')
        self.provider_reference = notification_data.get('id')

        if payment_status in const.PAYMENT_STATUS_MAPPING['done']:
            self._set_done()
        elif payment_status in const.PAYMENT_STATUS_MAPPING['pending']:
            self._set_pending()
        elif payment_status in const.PAYMENT_STATUS_MAPPING['authorized']:
            self._set_authorized()
        elif payment_status in const.PAYMENT_STATUS_MAPPING['cancel']:
            self._set_canceled()
        elif payment_status in const.PAYMENT_STATUS_MAPPING['error']:
            self._set_error(_("Payment of transaction %s failed ", self.reference))

    def _get_specific_rendering_values(self, processing_values):
        """ Override of payment to return Xendit-specific rendering values.

        Note: self.ensure_one() from `_get_processing_values`

        :param dict processing_values: The generic and specific processing values of the transaction
        :return: The dict of provider-specific processing values.
        :rtype: dict
        """
        res = super()._get_specific_rendering_values(processing_values)
        if self.provider_code != 'xendit':
            return res

        base_url = self.provider_id.get_base_url()
        redirect_url = urls.url_join(base_url, '/payment/status')

        payload = {
            'external_id': self.reference,
            'amount': self.amount,
            'currency': self.currency_id.name,
            'description': self.reference,
            'customer': {
                'given_names': self.partner_name,
            },
            'success_redirect_url': redirect_url,
            'failure_redirect_url': redirect_url,
            'payment_methods': [const.PAYMENT_METHODS_MAPPING.get(self.payment_method_code, self.payment_method_code.upper())]
        }
        if self.partner_id.phone or self.partner_id.mobile:
            payload['customer']['mobile_number'] = self.partner_id.phone or self.partner_id.mobile
        if self.partner_id.email:
            payload['customer']['email'] = self.partner_id.email
        response_data = self.provider_id._xendit_make_request(payload)

        rendering_values = {
            'api_url': response_data.get('invoice_url')
        }
        return rendering_values
