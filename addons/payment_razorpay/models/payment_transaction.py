# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
import pprint

from werkzeug.urls import url_encode, url_join

from odoo import _, models
from odoo.exceptions import UserError, ValidationError

from odoo.addons.payment import utils as payment_utils
from odoo.addons.payment_razorpay.const import PAYMENT_STATUS_MAPPING
from odoo.addons.payment_razorpay.controllers.main import RazorpayController
from odoo.addons.payment_adyen.const import CURRENCY_DECIMALS


_logger = logging.getLogger(__name__)


class PaymentTransaction(models.Model):
    _inherit = 'payment.transaction'


    def _get_specific_processing_values(self, processing_values):

        res = super()._get_specific_rendering_values(processing_values)
        if self.provider_code not in ['razorpay', 'razorpay_auto']:
            return res

        data = {}
        if self.provider_code == 'razorpay_auto':
            # Retrive related customer id
            partner = self.env['res.partner'].browse(processing_values.get('partner_id'))
            payload = self._razorpay_prepare_customer_request_payload(partner)
            _logger.info(
                "Payload of '/customers' request for transaction with reference %s:\n%s",
                self.reference, pprint.pformat(payload)
            )
            payload['fail_existing'] = '0'
            customer_data = self.provider_id._razorpay_make_request(endpoint='customers', payload=payload)
            data.update({'customer_id': customer_data['id']})

        # Initiate the payment and retrieve the related order id.
        payload = self._razorpay_prepare_order_request_payload(customer_data['id'])
        _logger.info(
            "Payload of '/orders' request for transaction with reference %s:\n%s",
            self.reference, pprint.pformat(payload)
        )
        order_data = self.provider_id._razorpay_make_request(endpoint='orders', payload=payload)
        _logger.info(
            "Response of '/orders' request for transaction with reference %s:\n%s",
            self.reference, pprint.pformat(order_data)
        )

        return {
            **data,
            'order_id': order_data['id'],
        }


    def _get_specific_rendering_values(self, processing_values):
        """ Override of `payment` to return razorpay-specific rendering values.

        Note: self.ensure_one() from `_get_processing_values`

        :param dict processing_values: The generic and specific processing values of the
                                       transaction.
        :return: The dict of provider-specific rendering values.
        :rtype: dict
        """

        res = super()._get_specific_rendering_values(processing_values)
        if self.provider_code not in ['razorpay', 'razorpay_auto']:
            return res

        # Initiate the payment
        converted_amount = payment_utils.to_minor_currency_units(self.amount, self.currency_id)
        base_url = self.provider_id.get_base_url()
        return_url_params = {'reference': self.reference}

        phone = self.partner_phone
        if phone:
            # sanitize partner phone
            try:
                phone = self._phone_format(number=phone, country=self.partner_country_id, raise_exception=True)
            except Exception as err:
                raise ValidationError("Razorpay: " + str(err)) from err
        else:
            raise ValidationError("Razorpay: " + _("The phone number is missing."))

        rendering_values = {
            'key_id': self.provider_id.razorpay_key_id,
            'name': self.company_id.name,
            'description': self.reference,
            'company_logo': url_join(base_url, f'web/image/res.company/{self.company_id.id}/logo'),
            'order_id': processing_values['order_id'],
            'amount': converted_amount,
            'currency': self.currency_id.name,
            'partner_name': self.partner_name,
            'partner_email': self.partner_email,
            'partner_phone': phone,
            'return_url': url_join(
                base_url, f'{RazorpayController._return_url}?{url_encode(return_url_params)}'
            ),
        }
        return rendering_values

    def _razorpay_prepare_customer_request_payload(self, partner):
        """ Create and return a razorpay subscription plan.
        Note: self.ensure_one()
        """
        phone = partner.phone
        if phone:
            # sanitize partner phone
            try:
                phone = self._phone_format(number=phone, country=self.partner_country_id, raise_exception=True)
            except Exception as err:
                raise ValidationError("Razorpay: " + str(err)) from err
        else:
            raise ValidationError("Razorpay: " + ("The phone number is missing."))

        data = {
            'name': partner.name,
            'email': partner.email,
            'contact': phone,
        }
        return data

    def _razorpay_prepare_order_request_payload(self, customer_id):
        """ Create the payload for the order request based on the transaction values.

        :return: The request payload.
        :rtype: dict
        """
        converted_amount = payment_utils.to_minor_currency_units(self.amount, self.currency_id)
        payload = {
            'amount': converted_amount,
            'currency': self.currency_id.name,
            'customer_id': customer_id,
        }
        if self.provider_id.capture_manually:  # The related payment must be only authorized.
            payload.update({
                'payment': {
                    'capture': 'manual',
                    'capture_options': {
                        'manual_expiry_period': 7200,  # The default value for this required option.
                        'refund_speed': 'normal',  # The default value for this required option.
                    }
                },
            })
        return payload

    def _send_refund_request(self, amount_to_refund=None):
        """ Override of `payment` to send a refund request to Razorpay.

        Note: self.ensure_one()

        :param float amount_to_refund: The amount to refund.
        :return: The refund transaction created to process the refund request.
        :rtype: recordset of `payment.transaction`
        """
        refund_tx = super()._send_refund_request(amount_to_refund=amount_to_refund)
        if self.provider_code not in ['razorpay', 'razorpay_auto']:
            return refund_tx

        # Make the refund request to Razorpay.
        converted_amount = payment_utils.to_minor_currency_units(
            -refund_tx.amount, refund_tx.currency_id
        )  # The amount is negative for refund transactions.
        payload = {
            'amount': converted_amount,
            'notes': {
                'reference': refund_tx.reference,  # Allow retrieving the ref. from webhook data.
            },
        }
        _logger.info(
            "Payload of '/payments/<id>/refund' request for transaction with reference %s:\n%s",
            self.reference, pprint.pformat(payload)
        )
        response_content = refund_tx.provider_id._razorpay_make_request(
            f'payments/{self.provider_reference}/refund', payload=payload
        )
        _logger.info(
            "Response of '/payments/<id>/refund' request for transaction with reference %s:\n%s",
            self.reference, pprint.pformat(response_content)
        )
        response_content.update(entity_type='refund')
        refund_tx._handle_notification_data('razorpay', response_content)

        return refund_tx

    def _send_capture_request(self, amount_to_capture=None):
        """ Override of `payment` to send a capture request to Razorpay. """
        child_capture_tx = super()._send_capture_request(amount_to_capture=amount_to_capture)
        if self.provider_code not in ['razorpay', 'razorpay_auto']:
            return child_capture_tx

        converted_amount = payment_utils.to_minor_currency_units(self.amount, self.currency_id)
        payload = {'amount': converted_amount, 'currency': self.currency_id.name}
        _logger.info(
            "Payload of '/payments/<id>/capture' request for transaction with reference %s:\n%s",
            self.reference, pprint.pformat(payload)
        )
        response_content = self.provider_id._razorpay_make_request(
            f'payments/{self.provider_reference}/capture', payload=payload
        )
        _logger.info(
            "Response of '/payments/<id>/capture' request for transaction with reference %s:\n%s",
            self.reference, pprint.pformat(response_content)
        )

        # Handle the capture request response.
        self._handle_notification_data('razorpay', response_content)

        return child_capture_tx

    def _send_void_request(self, amount_to_void=None):
        """ Override of `payment` to explain that it is impossible to void a Razorpay transaction.
        """
        child_void_tx = super()._send_void_request(amount_to_void=amount_to_void)
        if self.provider_code not in ['razorpay', 'razorpay_auto']:
            return child_void_tx

        raise UserError(_("Transactions processed by Razorpay can't be manually voided from Odoo."))

    def _get_tx_from_notification_data(self, provider_code, notification_data):
        """ Override of `payment` to find the transaction based on razorpay data.

        :param str provider_code: The code of the provider that handled the transaction
        :param dict notification_data: The normalized notification data sent by the provider
        :return: The transaction if found
        :rtype: recordset of `payment.transaction`
        :raise: ValidationError if the data match no transaction
        """
        tx = super()._get_tx_from_notification_data(provider_code, notification_data)
        if provider_code not in ['razorpay', 'razorpay_auto'] or len(tx) == 1:
            return tx

        entity_type = notification_data.get('entity_type', 'payment')
        if entity_type == 'payment':
            reference = notification_data.get('description')
            if not reference:
                raise ValidationError("Razorpay: " + _("Received data with missing reference."))
            tx = self.search([('reference', '=', reference), ('provider_code', 'in', ['razorpay', 'razorpay_auto'])])
        else:  # 'refund'
            reference = notification_data.get('notes', {}).get('reference')
            if reference:  # The refund was initiated from Odoo.
                tx = self.search([('reference', '=', reference), ('provider_code', 'in', ['razorpay', 'razorpay_auto'])])
            else:  # The refund was initiated from Razorpay.
                # Find the source transaction based on its provider reference.
                source_tx = self.search([
                    ('provider_reference', '=', notification_data['payment_id']),
                    ('provider_code', 'in', ['razorpay', 'razorpay_auto']),
                ])
                if source_tx:
                    # Manually create a refund transaction with a new reference.
                    tx = self._razorpay_create_refund_tx_from_notification_data(
                        source_tx, notification_data
                    )
                else:  # The refund was initiated for an unknown source transaction.
                    pass  # Don't do anything with the refund notification.
        if not tx:
            raise ValidationError(
                "Razorpay: " + _("No transaction found matching reference %s.", reference)
            )

        return tx

    def _razorpay_create_refund_tx_from_notification_data(self, source_tx, notification_data):
        """ Create a refund transaction based on Razorpay data.

        :param recordset source_tx: The source transaction for which a refund is initiated, as a
                                    `payment.transaction` recordset.
        :param dict notification_data: The notification data sent by the provider.
        :return: The newly created refund transaction.
        :rtype: recordset of `payment.transaction`
        :raise ValidationError: If inconsistent data were received.
        """
        refund_provider_reference = notification_data.get('id')
        amount_to_refund = notification_data.get('amount')
        if not refund_provider_reference or not amount_to_refund:
            raise ValidationError("Razorpay: " + _("Received incomplete refund data."))

        converted_amount = payment_utils.to_major_currency_units(
            amount_to_refund, source_tx.currency_id
        )
        return source_tx._create_child_transaction(
            converted_amount, is_refund=True, provider_reference=refund_provider_reference
        )

    def _process_notification_data(self, notification_data):
        """ Override of `payment` to process the transaction based on Razorpay data.

        Note: self.ensure_one()

        :param dict notification_data: The notification data sent by the provider
        :return: None
        """
        super()._process_notification_data(notification_data)
        if self.provider_code not in ['razorpay', 'razorpay_auto']:
            return

        if 'id' in notification_data:  # We have the full entity data (S2S request or webhook).
            entity_data = notification_data
        else:  # The payment data are not complete (redirect from checkout).
            # Fetch the full payment data.
            entity_data = self.provider_id._razorpay_make_request(
                f'payments/{notification_data["razorpay_payment_id"]}', method='GET'
            )
            _logger.info(
                "Response of '/payments' request for transaction with reference %s:\n%s",
                self.reference, pprint.pformat(entity_data)
            )
        entity_id = entity_data.get('id')
        if not entity_id:
            raise ValidationError("Razorpay: " + _("Received data with missing entity id."))
        self.provider_reference = entity_id

        entity_status = entity_data.get('status')
        if not entity_status:
            raise ValidationError("Razorpay: " + _("Received data with missing status."))

        if entity_status in PAYMENT_STATUS_MAPPING['pending']:
            self._set_pending()
        elif entity_status in PAYMENT_STATUS_MAPPING['authorized']:
            if self.tokenize:
                self._razorpay_auto_tokenize_from_notification_data(notification_data)
            self._set_authorized()
        elif entity_status in PAYMENT_STATUS_MAPPING['done']:
            if self.tokenize:
                self._razorpay_auto_tokenize_from_notification_data(notification_data)
            self._set_done()

            # Immediately post-process the transaction if it is a refund, as the post-processing
            # will not be triggered by a customer browsing the transaction from the portal.
            if self.operation == 'refund':
                self.env.ref('payment.cron_post_process_payment_tx')._trigger()
        elif entity_status in PAYMENT_STATUS_MAPPING['error']:
            _logger.warning(
                "The transaction with reference %s underwent an error. Reason: %s",
                self.reference, entity_data.get('error_description')
            )
            self._set_error(
                _("An error occurred during the processing of your payment. Please try again.")
            )
        else:  # Classify unsupported payment status as the `error` tx state.
            _logger.warning(
                "Received data for transaction with reference %s with invalid payment status: %s",
                self.reference, entity_status
            )
            self._set_error(
                "Razorpay: " + _("Received data with invalid status: %s", entity_status)
            )

    def _razorpay_auto_tokenize_from_notification_data(self, notification_data):
        """ Create a new token based on the notification data.

        :param dict notification_data: The notification data built with Razorpay objects.
                                       See `_process_notification_data`.
        :return: None
        """
        
        # get customer Id

        # Create the token.
        token = self.env['payment.token'].create({
            'provider_id': self.provider_id.id,
            'payment_details': notification_data['razorpay_order_id'],
            'partner_id': self.partner_id.id,
            'provider_ref': notification_data['razorpay_payment_id'],
            'verified': True,
        })
        self.write({
            'token_id': token,
            'tokenize': False,
        })
        _logger.info(
            "created token with id %(token_id)s for partner with id %(partner_id)s from "
            "transaction with reference %(ref)s",
            {
                'token_id': token.id,
                'partner_id': self.partner_id.id,
                'ref': self.reference,
            },
        )

    def _send_payment_request(self):
        """ Override of payment to send a payment request to Stripe with a confirmed PaymentIntent.

        Note: self.ensure_one()

        :return: None
        :raise: UserError if the transaction is not linked to a token
        """
        super()._send_payment_request()
        if self.provider_code != 'razorpay_auto':
            return

        if not self.token_id:
            raise UserError("Stripe: " + _("The transaction is not linked to a token."))

        token_data = self.provider_id._razorpay_make_request(endpoint=f"payments/{self.token_id.provider_ref}", payload={'id': self.token_id.provider_ref}, method="GET")

        # Make the payment request to Stripe
        converted_amount = payment_utils.to_minor_currency_units(self.amount, self.currency_id)
        data = {
            'amount': converted_amount,
            'currency': self.currency_id.name,
    
        }

        order_data = self.provider_id._razorpay_make_request(endpoint='orders', payload=data)
        _logger.info(
            "new",
            self.reference, pprint.pformat(order_data)
        )

        recurring_data = {
            'email': self.partner_id.email,
            'contact': self.partner_id.phone,
            'amount': converted_amount,
            'currency': self.currency_id.name,
            'order_id': order_data['id'],
            'customer_id': self.token_id.provider_ref,
            'token': token_data['token_id'],
            'recurring': 1,
            'description': 'Creating recurring payment for Gaurav Kumar',
        }

        new = self.provider_id._razorpay_make_request(endpoint='payments/create/recurring', payload=recurring_data)
        _logger.info(
            "new",
            self.reference, pprint.pformat(new)
        )
       
