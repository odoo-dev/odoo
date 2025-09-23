# Part of Odoo. See LICENSE file for full copyright and licensing details.

import uuid
import json

import logging
import pprint

from odoo import api, models
from odoo.exceptions import ValidationError

from odoo.addons.payment_easebuzz import utils as easebuzz_utils
from odoo.addons.payment_easebuzz import const as easebuzz_const

from odoo.addons.payment_easebuzz.controllers.main import EasebuzzController

_logger = logging.getLogger(__name__)


class PaymentTransaction(models.Model):
    _inherit = "payment.transaction"

    def _get_specific_processing_values(self, processing_values):
        """ Override of `payment` to return easebuzz-specific processing values.

        Note: self.ensure_one() from `_get_processing_values`

        :param dict processing_values: The generic and specific processing values of the
                                        transaction.
        :return: The provider-specific processing values.
        :rtype: dict
        """
        res = super()._get_specific_processing_values(processing_values)
        if self.provider_code != 'easebuzz':
            return res

        access_token = self._easebuzz_create_payment_order()['data']
        return {
            'access_key': access_token,
            'key': self.provider_id.easebuzz_key,
            'txn_env': 'test' if self.provider_id.state == 'test' else 'prod',
        }

    def _easebuzz_create_payment_order(self):
        """ Create and return an Order object to initiate the payment.

        :return: The created Order.
        :rtype: dict
        """
        payload = self._easebuzz_prepare_order_payload()
        _logger.info(
            "Sending '/payment/initiateLink' request for transaction with reference %s:\n%s",
            self.reference, pprint.pformat(payload)
        )
        order_data = self.provider_id._easebuzz_make_request('/payment/initiateLink', payload=payload)
        _logger.info(
            "Response of '/payment/initiateLink' request for transaction with reference %s:\n%s",
            self.reference, pprint.pformat(order_data)
        )
        return order_data

    def _easebuzz_prepare_order_payload(self):
        """ Prepare the payload for the order request based on the transaction values.

        :return: The request payload.
        :rtype: dict
        """
        pm_code = (self.payment_method_id.primary_payment_method_id or self.payment_method_id).code
        easebuzz_pm_code = easebuzz_const.PAYMENT_METHOD_CODES_MAPPING[pm_code]
        showPaymentMode = ','.join(easebuzz_pm_code)
        easebuzz_txn_id = uuid.uuid4().hex
        return_url = f'{self.provider_id.get_base_url()}{EasebuzzController.RETURN_URL}'
        payload = {
            'key': self.provider_id.easebuzz_key,
            'txnid': easebuzz_txn_id,
            'amount': self.amount,
            'productinfo': '',
            'firstname': self.partner_name,
            'phone': self.partner_phone,
            'email': self.partner_email,
            'surl': return_url,
            'furl': return_url,
            'udf1': self.reference,
            'show_payment_mode': showPaymentMode,
            'salt': self.provider_id.easebuzz_salt  # Delete `salt` key after computing payload hash as it is not required in payload
        }
        hash_payload = easebuzz_utils.compute_hash_payload(payload, easebuzz_const.EASEBUZZ_HASH_SEQUENCE['PAYMENT'])
        payload['hash'] = hash_payload
        payload.pop('salt', None)
        return payload

    def _send_refund_request(self):
        """ Override of `payment` to send refund request to Razorpay. """
        if self.provider_code != 'easebuzz':
            return super()._send_refund_request()

        merchant_refund_id = uuid.uuid4().hex
        payload = {
            'key': self.provider_id.easebuzz_key,
            'merchant_refund_id': merchant_refund_id,
            'easebuzz_id': self.source_transaction_id.provider_reference,
            'refund_amount': -self.amount,
            'udf1': self.reference,
            'salt': self.provider_id.easebuzz_salt  # Delete `salt` key after computing payload hash as it is not required in payload
        }
        hash_payload = easebuzz_utils.compute_hash_payload(payload, easebuzz_const.EASEBUZZ_HASH_SEQUENCE['REFUND'])
        payload['hash'] = hash_payload
        payload.pop('salt', None)

        _logger.info(
            "Sending '/transaction/v2/refund' request for transaction with reference %s:\n%s",
            self.reference, pprint.pformat(payload)
        )
        order_data = self.provider_id._easebuzz_make_request('/transaction/v2/refund', payload=json.dumps(payload), mode='refund')
        _logger.info(
            "Response of '/transaction/v2/refund' request for transaction with reference %s:\n%s",
            self.reference, pprint.pformat(order_data)
        )

    @api.model
    def _search_by_reference(self, provider_code, payment_data):
        """ Override of `payment` to find the transaction based on Easebuzz data.

        :param str provider_code: The code of the provider that handled the transaction
        :param dict notification_data: The normalized notification data sent by the provider
        :return: The transaction if found
        :rtype: recordset of `payment.transaction`
        """

        if provider_code != 'easebuzz':
            return super()._search_by_reference(provider_code, payment_data)

        reference = payment_data.get('udf1', '')
        tx = self.search([('reference', '=', reference), ('provider_code', '=', 'easebuzz')])

        return tx

    def _extract_amount_data(self, payment_data):
        """Override of payment to extract the amount and currency from the payment data."""
        if self.provider_code != 'easebuzz':
            return super()._extract_amount_data(payment_data)

        webhook_type = payment_data.get('webhook_type')
        amount_key = 'amount' if webhook_type == 'payment' else 'refund_amount'

        return {
            'amount': float(payment_data.get(amount_key)),
            'currency_code': 'INR',  # Easebuzz doesn't provide currency code in webhook data. And this is constant as INR for all.
        }

    def _apply_updates(self, payment_data):
        """Override of `payment` to update the transaction based on the payment data."""
        if self.provider_code != 'easebuzz':
            return super()._apply_updates(payment_data)

        webhook_type = payment_data.get('webhook_type', 'payment')

        # Update the provider reference.
        if webhook_type == 'payment':
            provider_reference = payment_data.get('easepayid')
        else:  # refund
            provider_reference = payment_data.get('refund_id')
        if not provider_reference:
            raise ValidationError("Easebuzz: Received data with missing id.")

        allowed_to_modify = self.state not in ('done', 'authorized')
        if allowed_to_modify:
            self.provider_reference = provider_reference

        # Update the payment method.
        payment_method_type = payment_data.get('mode', '')
        if not payment_method_type:  # Refund
            payment_data.get('transaction_type', '')
        payment_method = self.env['payment.method']._get_from_code(
            payment_method_type, mapping=easebuzz_const.PAYMENT_METHODS_MAPPING
        )
        if allowed_to_modify and payment_method:
            self.payment_method_id = payment_method

        # Update the payment state.
        status_key = 'status' if webhook_type == 'payment' else 'refund_status'
        entity_status = payment_data.get(status_key)
        if not entity_status:
            raise ValidationError("Easebuzz: Received data with missing status.")

        STATUS_MAPPING = easebuzz_const.PAYMENT_STATUS_MAPPING if webhook_type == 'payment' else easebuzz_const.REFUND_STATUS_MAPPING
        if entity_status in STATUS_MAPPING['done']:
            self._set_done()
        elif entity_status in STATUS_MAPPING.get('in progress', ''):
            self._set_pending()
        elif entity_status in STATUS_MAPPING.get('authorized', ''):
            self._set_authorized()
        elif entity_status in STATUS_MAPPING['error']:
            _logger.warning(
                "The transaction with reference %s underwent an error. Reason: %s",
                self.reference, payment_data.get('error_message')
            )
            self._set_error(
                "An error occurred during the processing of your payment. Please try again."
            )
        else:  # Classify unsupported payment status as the `error` tx state.
            _logger.warning(
                "Received data for transaction with reference %s with invalid payment status: %s",
                self.reference, entity_status
            )
            self._set_error(
                f"Easebuzz: Received data with invalid status: {entity_status}"
            )
