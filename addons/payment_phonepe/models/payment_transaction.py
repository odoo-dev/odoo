# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
import pprint

import uuid

from odoo import fields, models
from odoo.exceptions import ValidationError

from odoo.addons.payment import utils as payment_utils
from odoo.addons.payment_phonepe import const as phonepe_const

from odoo.addons.payment_phonepe.controllers.main import PhonepeController

_logger = logging.getLogger(__name__)


class PaymentTransaction(models.Model):
    _inherit = 'payment.transaction'

    phonepe_merchant_order_id = fields.Char(string="Merchant Order Id")

    def _send_refund_request(self):
        """ Override of `payment` to send a refund request to Phonepe.

        Note: self.ensure_one()

        :param float amount_to_refund: The amount to refund.
        :return: The refund transaction created to process the refund request.
        :rtype: recordset of `payment.transaction`
        """
        if self.provider_code != 'phonepe':
            return super()._send_refund_request()

        # Make the refund request to Phonepe.
        converted_amount = payment_utils.to_minor_currency_units(
            -self.amount, self.currency_id
        )  # The amount is negative for refund transactions.

        merchant_refund_id = uuid.uuid4().hex
        payload = {
            'merchantRefundId': merchant_refund_id,
            'originalMerchantOrderId': self.source_transaction_id.phonepe_merchant_order_id,
            'amount': converted_amount,
        }
        _logger.info(
            "Payload of '/payments/v2/refund' request for transaction with reference %s:\n%s",
            self.reference, pprint.pformat(payload)
        )
        response_content = self.provider_id._phonepe_make_request(
            '/payments/v2/refund', payload=payload)
        _logger.info(
            "Response of '/payments/v2/refund' request for transaction with reference %s:\n%s",
            self.reference, pprint.pformat(response_content)
        )

    def _get_specific_processing_values(self, processing_values):
        """ Override of `payment` to return phonepe-specific processing values.

        Note: self.ensure_one() from `_get_processing_values`

        :param dict processing_values: The generic and specific processing values of the
                                       transaction.
        :return: The provider-specific processing values.
        :rtype: dict
        """
        res = super()._get_specific_processing_values(processing_values)
        if self.provider_code != 'phonepe':
            return res

        token_url = self._phonepe_create_payment_order()['redirectUrl']
        return {
            'token_url': token_url,
            'type': 'IFRAME',
        }

    def _phonepe_create_payment_order(self):
        """ Create and return an Order object to initiate the payment.

        :return: The created Order.
        :rtype: dict
        """
        payload = self._phonepe_prepare_order_payload()
        _logger.info(
            "Sending '/checkout/v2/pay' request for transaction with reference %s:\n%s",
            self.reference, pprint.pformat(payload)
        )
        order_data = self.provider_id._phonepe_make_request('/checkout/v2/pay', payload=payload)
        _logger.info(
            "Response of '/checkout/v2/pay' request for transaction with reference %s:\n%s",
            self.reference, pprint.pformat(order_data)
        )
        return order_data

    def _phonepe_prepare_order_payload(self):
        """ Prepare the payload for the order request based on the transaction values.

        :return: The request payload.
        :rtype: dict
        """
        converted_amount = payment_utils.to_minor_currency_units(self.amount, self.currency_id)
        pm_code = (self.payment_method_id.primary_payment_method_id or self.payment_method_id).code
        phonepe_pm_code = phonepe_const.PAYMENT_METHOD_CODES_MAPPING[pm_code]
        enablePaymentModes = [{'type': pm_code} for pm_code in phonepe_pm_code]
        if pm_code == 'card':
            enablePaymentModes[0].update({
                'cardTypes': [
                    'CREDIT_CARD',
                    'DEBIT_CARD'
                ]
            })
        merchant_order_id = uuid.uuid4().hex
        self.write({
            'phonepe_merchant_order_id': merchant_order_id,
        })
        payload = {
            'merchantOrderId': merchant_order_id,  # It should be unique as it is used for pooling the payment status
            'amount': converted_amount,
            'metaInfo': {
                'reference': self.reference,
            },
            'paymentFlow': {
                'type': 'PG_CHECKOUT',
                'merchantUrls': {
                    'redirectUrl': f'{self.provider_id.get_base_url()}{PhonepeController.RETURN_URL}'
                },
                'paymentModeConfig': {
                    "enabledPaymentModes": enablePaymentModes
                }
            },
        }
        return payload

    def _search_by_reference(self, provider_code, payment_data):
        """ Override of `payment` to find the transaction based on phonepe data.

        :param str provider_code: The code of the provider that handled the transaction
        :param dict payment_data: The normalized notification data sent by the provider
        :return: The transaction if found
        :rtype: recordset of `payment.transaction`
        :raise: ValidationError if the data match no transaction
        """
        tx = super()._search_by_reference(provider_code, payment_data)
        if provider_code != 'phonepe' or len(tx) == 1:
            return tx

        webhook_type = payment_data.get('webhook_type', 'payment')
        if webhook_type == 'payment':
            reference = payment_data.get('metaInfo', {}).get('reference', '')
            if not reference:
                raise ValidationError("Phonepe: Received data with missing reference.")
            tx = self.search([('reference', '=', reference), ('provider_code', '=', 'phonepe')])
        else:  # refund
            merchantOrderId = payment_data.get('originalMerchantOrderId')
            source_tx = self.search([('phonepe_merchant_order_id', '=', merchantOrderId)])
            tx = self.search([('source_transaction_id', '=', source_tx.id)])

        if not tx:
            raise ValidationError(
                f"Phonepe: No transaction found matching reference {reference}.",
            )

        return tx

    def _apply_updates(self, payment_data):
        """ Override of `payment` to process the transaction based on Phonepe data.

        Note: self.ensure_one()

        :param dict payment_data: The notification data sent by the provider
        :return: None
        """
        super()._apply_updates(payment_data)
        if self.provider_code != 'phonepe':
            return

        webhook_type = payment_data.get('webhook_type', 'payment')

        # Update the provider reference.
        if webhook_type == 'payment':
            provider_reference = payment_data.get('orderId')
        else:  # refund
            provider_reference = payment_data.get('refundId')
        if not provider_reference:
            raise ValidationError("Phonepe: Received data with missing id.")
        allowed_to_modify = self.state not in ('done', 'authorized')
        if allowed_to_modify:
            self.provider_reference = provider_reference

        # Update the payment method.
        payment_method_type = payment_data.get('paymentDetails', [{}])[0].get('paymentMode', '')
        payment_method = self.env['payment.method']._get_from_code(
            payment_method_type, mapping=phonepe_const.PAYMENT_METHODS_MAPPING
        )
        if allowed_to_modify and payment_method:
            self.payment_method_id = payment_method

        # Update the payment state.
        entity_status = payment_data.get('state')
        if not entity_status:
            raise ValidationError("Phonepe: Received data with missing status.")

        if entity_status in phonepe_const.PAYMENT_STATUS_MAPPING['done']:
            self._set_done()
        elif entity_status in phonepe_const.PAYMENT_STATUS_MAPPING['error']:
            _logger.warning(
                "The transaction with reference %s underwent an error. Reason: %s",
                self.reference, payment_data.get('errorCode')
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
                f"Phonepe: Received data with invalid status: {entity_status}"
            )

    def _extract_amount_data(self, payment_data):
        """Override of payment to extract the amount and currency from the payment data."""
        if self.provider_code != 'phonepe':
            return super()._extract_amount_data(payment_data)

        # Amount not sent in the payment data when redirecting to the return route.
        if 'amount' not in payment_data:
            return

        amount = payment_utils.to_major_currency_units(
            float(payment_data['amount']), self.currency_id
        )
        return {
            'amount': amount,
            'currency_code': 'INR',
        }
