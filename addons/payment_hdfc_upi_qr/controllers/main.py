# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
import pprint

from werkzeug.exceptions import Forbidden

from odoo import _, http
from odoo.exceptions import ValidationError
from odoo.http import request

from odoo.addons.payment_hdfc_upi_qr import utils as hdfc_upi_utils

_logger = logging.getLogger(__name__)


class HdfcUpiController(http.Controller):
    _callback_url = '/payment/hdfc_upi/callback'
    _cancel_transaction_url = '/payment/hdfc_upi/cancel_transaction'

    @http.route(_callback_url, type='http', methods=['POST'], auth='public', csrf=False)
    def hdfc_upi_callback(self, **post):
        """Process the notification data sent by HDFC UPI after a transaction.

        HDFC UPI Callback API Details:
        - Request Method: POST
        - Content Type: Application/JSON
        - Query Parameters: meRes (encrypted response), pgMerchantId (merchant ID)
        - Expected Response: HTTP 200
        - Response Format: 21 pipe-separated fields as per HDFC UPI specification

        :param dict post: POST data containing encrypted response and merchant ID
        :return: HTTP response with status 200 to acknowledge the notification
        :rtype: str
        """
        _logger.info("Notification received from HDFC UPI with data:\n%s", pprint.pformat(post))

        # Get parameters from callback (can be in POST data or query parameters)
        encrypted_response = post.get('meRes') or request.httprequest.args.get('meRes')
        merchant_id = post.get('pgMerchantId') or request.httprequest.args.get('pgMerchantId')

        if not encrypted_response or not merchant_id:
            _logger.warning("Received notification with missing parameters")
            raise Forbidden()

        try:
            # Find the payment provider by merchant ID
            provider_sudo = request.env['payment.provider'].sudo().search([
                ('code', '=', 'hdfc_upi'),
                ('hdfc_upi_merchant_id', '=', merchant_id)
            ], limit=1)

            if not provider_sudo:
                _logger.warning("Payment provider not found for merchant ID: %s", merchant_id)
                raise Forbidden()

            # Decrypt the response
            decrypted_data = self._decrypt_hdfc_response(encrypted_response, provider_sudo)

            # Handle the notification data
            self._handle_hdfc_notification(decrypted_data, provider_sudo)

        except ValidationError:
            _logger.exception("Unable to handle the notification data; skipping to acknowledge")

        # Return HTTP 200 response as expected by HDFC UPI
        return request.make_response('OK', headers={'Content-Type': 'text/plain'})

    def _decrypt_hdfc_response(self, encrypted_response, provider_sudo):
        """Decrypt the response data from HDFC UPI gateway.

        :param str encrypted_response: The encrypted response data
        :param recordset provider_sudo: The sudoed payment provider record
        :return: The decrypted response data
        :rtype: str
        :raise: :class:`odoo.exceptions.ValidationError` if decryption fails
        """
        if not provider_sudo.hdfc_upi_encryption_key:
            _logger.error("Encryption key not configured for provider: %s", provider_sudo.name)
            raise ValidationError(_("Encryption key not configured"))

        try:
            decrypted_response = hdfc_upi_utils.decrypt_payload(
                encrypted_response, provider_sudo.hdfc_upi_encryption_key
            )
        except (ValueError, TypeError, KeyError) as e:
            _logger.exception("Error decrypting HDFC UPI response")
            raise ValidationError(_("Failed to decrypt response: %s", str(e)))

        # Handle different response types from decryption (moved outside try block)
        if isinstance(decrypted_response, dict):
            if 'error' in decrypted_response:
                _logger.error("Decryption error: %s", decrypted_response['error'])
                raise ValidationError(_("Decryption error: %s", decrypted_response['error']))
            # Convert dict back to string for processing
            return str(decrypted_response)

        return decrypted_response

    def _handle_hdfc_notification(self, decrypted_data, provider_sudo):
        """Handle the decrypted notification data from HDFC UPI.

        :param str decrypted_data: The decrypted response data
        :param recordset provider_sudo: The sudoed payment provider record
        :return: None
        :raise: :class:`odoo.exceptions.ValidationError` if processing fails
        """
        if not decrypted_data:
            raise ValidationError(_("Empty notification data"))

        # Parse pipe-separated response
        fields_data = decrypted_data.split('|')

        _logger.info("Parsed %d fields from notification data", len(fields_data))

        if len(fields_data) < 21:
            _logger.warning("Invalid notification format - expected 21 fields, got %d", len(fields_data))
            raise ValidationError(_("Invalid notification format"))

        # Extract order number (merchant transaction reference)
        order_no = fields_data[1]
        if not order_no:
            _logger.warning("Order number missing in notification data")
            raise ValidationError(_("Order number missing"))

        try:
            # Get the transaction using Odoo's standard method
            tx_sudo = request.env['payment.transaction'].sudo()._get_tx_from_notification_data(
                'hdfc_upi', {'orderNo': order_no}
            )

            # Use the consolidated parsing method from the transaction model
            notification_data = tx_sudo._parse_hdfc_notification_fields(fields_data, 'callback')

            _logger.info(
                "Processing notification for transaction with reference %s:\n%s",
                tx_sudo.reference, pprint.pformat(notification_data)
            )

            # Handle the notification data using the standard processing method
            tx_sudo._process_notification_data(notification_data)

        except ValidationError:
            _logger.exception("Unable to process notification for order: %s", order_no)
            raise

    @http.route(f'{_cancel_transaction_url}/<int:tx_id>', type='jsonrpc', auth='public')
    def hdfc_upi_cancel_transaction(self, tx_id, reason=None, **kwargs):
        """Cancel a payment transaction.

        :param int tx_id: The transaction ID
        :param str reason: Optional reason for cancellation
        :param dict kwargs: Additional parameters (unused)
        :return: The result of the cancellation
        :rtype: dict
        """
        _logger.info("Cancelling transaction: %s, reason: %s", tx_id, reason)

        try:
            tx_sudo = request.env['payment.transaction'].sudo().browse(tx_id).exists()
            if not tx_sudo or tx_sudo.provider_code != 'hdfc_upi':
                _logger.warning("Transaction not found or not HDFC UPI: %s", tx_id)
                return {'success': False, 'error': 'Transaction not found'}

            # Only cancel if transaction is still pending
            if tx_sudo.state not in ['draft', 'pending']:
                _logger.warning("Cannot cancel transaction %s in state: %s", tx_id, tx_sudo.state)
                return {
                    'success': False,
                    'error': f'Cannot cancel transaction in {tx_sudo.state} state',
                    'current_state': tx_sudo.state
                }

            # Set cancellation reason
            cancellation_reason = reason or "Payment has been cancelled."

            # Cancel the transaction
            tx_sudo._set_canceled(cancellation_reason)

            _logger.info("Transaction %s cancelled successfully with reason: %s", tx_id, cancellation_reason)

            return {
                'success': True,
                'state': 'cancel',
                'message': cancellation_reason
            }

        except Exception:
            _logger.exception("Error cancelling transaction %s", tx_id)
            return {'success': False, 'error': 'An error occurred while cancelling the transaction'}
