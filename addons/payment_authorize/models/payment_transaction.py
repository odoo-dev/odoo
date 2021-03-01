# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
import pprint

from odoo import _, api, models

from odoo.addons.payment import utils as payment_utils
from odoo.exceptions import UserError, ValidationError

from .authorize_request import AuthorizeAPI

_logger = logging.getLogger(__name__)


class PaymentTransaction(models.Model):
    _inherit = 'payment.transaction'

    def _get_specific_processing_values(self, processing_values):
        """ Override of payment to include the access token in the processing values. """
        if self.provider != 'authorize':
            return super()._get_specific_processing_values(processing_values)

        return {
            'access_token': payment_utils.generate_access_token(
                self.env['ir.config_parameter'].sudo().get_param('database.secret'),
                processing_values['reference'],
                processing_values['partner_id']
            )
        }

    def _authorize_create_transaction_request(self, opaque_data):
        """ Create an Authorize.Net payment transaction request.

        Note: self.ensure_one()

        :param dict opaque_data: The payment details obfuscated by Authorize.Net
        :return:
        """
        self.ensure_one()

        authorize_API = AuthorizeAPI(self.acquirer_id)
        if self.acquirer_id.capture_manually or self.operation == 'validation':
            return authorize_API.authorize(self.amount, self.reference, opaque_data=opaque_data)
        else:
            return authorize_API.auth_and_capture(
                self.amount, self.reference, opaque_data=opaque_data
            )

    def _send_payment_request(self):
        super()._send_payment_request()  # log sent message

        if self.provider != 'authorize':
            return

        if not self.token_id.authorize_profile:
            raise UserError("Authorize.Net: " + _("The transaction is not linked to a token."))

        authorize_API = AuthorizeAPI(self.acquirer_id)
        if self.acquirer_id.capture_manually:
            res_content = authorize_API.authorize(self.amount, self.reference, token=self.token_id)
            _logger.info(f"authorize request response:\n{pprint.pformat(res_content)}")
        else:
            res_content = authorize_API.auth_and_capture(
                self.amount, self.reference, token=self.token_id
            )
            _logger.info(f"auth_and_capture request response:\n{pprint.pformat(res_content)}")

        # As the API has no redirection flow, we always know the reference of the transaction.
        # Still, we prefer to simulate the matching of the transaction by crafting dummy feedback
        # data in order to go through the centralized `_handle_feedback_data` method.
        feedback_data = {'reference': self.reference, 'response': res_content}
        self._handle_feedback_data('authorize', feedback_data)

    @api.model
    def _get_tx_from_feedback_data(self, provider, data):
        """ Find the transaction based on the feedback data.

        :param str provider: The provider of the acquirer that handled the transaction
        :param dict data: The feedback data sent by the acquirer
        :return: The transaction if found
        :rtype: recordset of `payment.transaction`
        """
        reference = data.get('reference')
        tx = self.search([('reference', '=', reference)])
        if not tx:
            raise ValidationError(
                "Authorize.Net: " + _("No transaction matching reference %s", reference)
            )
        return tx

    def _process_feedback_data(self, data):
        if self.provider != 'authorize':
            return super()._process_feedback_data(data)

        response_content = data.get('response')

        self.acquirer_reference = response_content.get('x_trans_id')
        status_code = response_content.get('x_response_code', '3')
        if status_code == '1':  # Approved
            status_type = response_content.get('x_type').lower()
            if status_type in ('auth_capture', 'prior_auth_capture'):
                self._set_done()
                if self.tokenize and not self.token_id:
                    self._authorize_tokenize()
            elif status_type == 'auth_only':
                self._set_authorized()
                if self.tokenize and not self.token_id:
                    self._authorize_tokenize()
            elif status_type == 'void':
                self._set_canceled()
        elif status_code == '2':  # Declined
            self._set_canceled()
        elif status_code == '4':  # Held for Review
            self._set_pending()
        else:  # Error / Unknown code
            error_code = response_content.get('x_response_reason_text')
            _logger.info(
                f"received data with invalid status code {status_code} and error code {error_code}"
            )
            self._set_error(
                "Authorize.Net: " + _(
                    "Received data with status code \"%(status)s\" and error code \"%(error)s\"",
                    status=status_code, error=error_code
                )
            )

    def _authorize_tokenize(self):
        """ Create a token for the current transaction.

        Note: self.ensure_one()

        :return: None
        """
        self.ensure_one()

        authorize_API = AuthorizeAPI(self.acquirer_id)
        cust_profile = authorize_API.create_customer_profile(
            self.partner_id, self.acquirer_reference
        )
        _logger.info(f"create_customer_profile request response:\n{pprint.pformat(cust_profile)}")
        if cust_profile:
            token = self.env['payment.token'].create({
                'acquirer_id': self.acquirer_id.id,
                'name': cust_profile.get('name'),
                'partner_id': self.partner_id.id,
                'acquirer_ref': cust_profile.get('payment_profile_id'),
                'authorize_profile': cust_profile.get('profile_id'),
            })
            self.write({
                'token_id': token.id,
                'tokenize': False,
            })
            _logger.info(
                f"created token with id {token.id} for partner with id {self.partner_id.id}"
            )

    def _send_refund_request(self):
        """ Request Authorize.Net to refund the transaction.

        Note: self.ensure_one()

        :return: None
        """
        self.ensure_one()

        if self.provider != 'authorize':
            super()._send_refund_request()

        authorize_API = AuthorizeAPI(self.acquirer_id)
        rounded_amount = round(self.amount, self.currency_id.decimal_places)
        res_content = authorize_API.refund(self.acquirer_reference, rounded_amount)
        _logger.info(f"refund request response:\n{pprint.pformat(res_content)}")
        # As the API has no redirection flow, we always know the reference of the transaction.
        # Still, we prefer to simulate the matching of the transaction by crafting dummy feedback
        # data in order to go through the centralized `_handle_feedback_data` method.
        feedback_data = {'reference': self.reference, 'response': res_content}
        self._handle_feedback_data('authorize', feedback_data)

    def _send_capture_request(self):
        """ Request Authorize.Net to capture the transaction.

        Note: self.ensure_one()

        :return: None
        """
        self.ensure_one()

        if self.provider != 'authorize':
            super()._send_capture_request()

        authorize_API = AuthorizeAPI(self.acquirer_id)
        rounded_amount = round(self.amount, self.currency_id.decimal_places)
        res_content = authorize_API.capture(self.acquirer_reference, rounded_amount)
        _logger.info(f"capture request response:\n{pprint.pformat(res_content)}")
        # As the API has no redirection flow, we always know the reference of the transaction.
        # Still, we prefer to simulate the matching of the transaction by crafting dummy feedback
        # data in order to go through the centralized `_handle_feedback_data` method.
        feedback_data = {'reference': self.reference, 'response': res_content}
        self._handle_feedback_data('authorize', feedback_data)

    def _send_void_request(self):
        """ Request Authorize.Net to void the transaction.

        Note: self.ensure_one()

        :return: None
        """
        self.ensure_one()

        if self.provider != 'authorize':
            super()._send_void_request()

        authorize_API = AuthorizeAPI(self.acquirer_id)
        res_content = authorize_API.void(self.acquirer_reference)
        _logger.info(f"void request response:\n{pprint.pformat(res_content)}")
        # As the API has no redirection flow, we always know the reference of the transaction.
        # Still, we prefer to simulate the matching of the transaction by crafting dummy feedback
        # data in order to go through the centralized `_handle_feedback_data` method.
        feedback_data = {'reference': self.reference, 'response': res_content}
        self._handle_feedback_data('authorize', feedback_data)
