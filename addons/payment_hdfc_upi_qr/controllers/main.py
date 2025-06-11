# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
import pprint
from datetime import datetime

from werkzeug.exceptions import Forbidden

from odoo import http
from odoo.exceptions import ValidationError
from odoo.http import request

from odoo.addons.payment_hdfc_upi_qr import utils as hdfc_upi_utils

_logger = logging.getLogger(__name__)


class HdfcUpiController(http.Controller):
    _callback_url = '/payment/hdfc_upi/callback'
    _get_qr_data_url = '/payment/hdfc_upi/get_qr_data'
    _cancel_transaction_url = '/payment/hdfc_upi/cancel_transaction'

    @http.route(_callback_url, type='http', auth='public', csrf=False, methods=['POST'], save_session=False)
    def hdfc_upi_callback(self, **post):
        """Process the notification data sent by HDFC UPI after a transaction.
        
        The route is flagged with `save_session=False` to prevent Odoo from assigning a new session
        to the user if they are redirected to this route with a POST request. Indeed, as the session
        cookie is created without a `SameSite` attribute, some browsers that don't implement the
        recommended default `SameSite=Lax` behavior will not include the cookie in the redirection
        request from the payment provider to Odoo.
        
        HDFC UPI Callback API Details:
        - Request Method: POST
        - Content Type: Application/JSON
        - Query Parameters: meRes (encrypted response), pgMerchantId (merchant ID)
        - Expected Response: HTTP 200
        - Response Format: 21 pipe-separated fields as per HDFC UPI specification
        
        Security Notes:
        - csrf=False is justified: External payment gateway callback (PY022 exception)
        - auth='public' is required: HDFC UPI server callbacks have no Odoo session
        - All inputs are validated and encrypted data is properly decrypted
        
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
            raise ValidationError("Encryption key not configured")
            
        try:
            decrypted_response = hdfc_upi_utils.decrypt_payload(
                encrypted_response, provider_sudo.hdfc_upi_encryption_key
            )
            
            # Handle different response types from decryption
            if isinstance(decrypted_response, dict):
                if 'error' in decrypted_response:
                    _logger.error("Decryption error: %s", decrypted_response['error'])
                    raise ValidationError(f"Decryption error: {decrypted_response['error']}")
                # Convert dict back to string for processing
                return str(decrypted_response)
            
            return decrypted_response
            
        except Exception as e:
            _logger.error("Error decrypting HDFC UPI response: %s", e, exc_info=True)
            raise ValidationError(f"Failed to decrypt response: {str(e)}")

    def _handle_hdfc_notification(self, decrypted_data, provider_sudo):
        """Handle the decrypted notification data from HDFC UPI.
        
        :param str decrypted_data: The decrypted response data
        :param recordset provider_sudo: The sudoed payment provider record
        :return: None
        :raise: :class:`odoo.exceptions.ValidationError` if processing fails
        """
        if not decrypted_data:
            raise ValidationError("Empty notification data")

        # Parse pipe-separated response
        fields_data = decrypted_data.split('|')
        
        _logger.info("Parsed %d fields from notification data", len(fields_data))

        if len(fields_data) < 21:
            _logger.warning("Invalid notification format - expected 21 fields, got %d", len(fields_data))
            raise ValidationError("Invalid notification format")

        # Extract order number (merchant transaction reference)
        order_no = fields_data[1]
        if not order_no:
            _logger.warning("Order number missing in notification data")
            raise ValidationError("Order number missing")

        try:
            # Get the transaction using Odoo's standard method
            tx_sudo = request.env['payment.transaction'].sudo()._get_tx_from_notification_data(
                'hdfc_upi', {'orderNo': order_no}
            )
            
            # Prepare notification data dictionary
            notification_data = self._parse_hdfc_notification_fields(fields_data)
            
            _logger.info(
                "processing notification for transaction with reference %s:\n%s",
                tx_sudo.reference, pprint.pformat(notification_data)
            )
            
            # Handle the notification data using our custom method
            tx_sudo._process_notification_data(notification_data)
            
        except ValidationError:
            _logger.exception("Unable to process notification for order: %s", order_no)
            raise

    @staticmethod
    def _parse_hdfc_notification_fields(fields_data):
        """Parse the pipe-separated fields from HDFC UPI notification.
        
        HDFC UPI Callback Format (21 fields):
        1. UPI Txn ID | 2. Order No | 3. Amount | 4. Txn Auth Date | 5. Status |
        6. Status Description | 7. Response Code | 8. Approval Number | 9. Payer VPA |
        10. Customer Ref No | 11. Reference ID | 12-16. Additional Fields 1-5 |
        17. Additional Field 6 (Payer Details) | 18. Additional Field 7 (Txn Details) |
        19. Additional Field 8 (Payee VPA) | 20. Additional Field 9 (Payer Acc Type) |
        21. Additional Field 10 (Payer Name)
        
        :param list fields_data: List of 21 pipe-separated fields
        :return: Dictionary of parsed notification data
        :rtype: dict
        """
        data = {
            # Core transaction fields (1-11)
            'txnId': fields_data[0] if fields_data[0] not in ['NA', 'null', ''] else False,
            'orderNo': fields_data[1],
            'amount': fields_data[2],
            'txnDate': fields_data[3],
            'status': fields_data[4],
            'responseMessage': fields_data[5] if fields_data[5] not in ['NA', 'null', ''] else False,
            'responseCode': fields_data[6] if fields_data[6] not in ['NA', 'null', ''] else False,
            'approvalNumber': fields_data[7] if fields_data[7] not in ['NA', 'null', ''] else False,
            'payerVPA': fields_data[8] if fields_data[8] not in ['NA', 'null', ''] else False,
            'customerRefNo': fields_data[9] if fields_data[9] not in ['NA', 'null', ''] else False,
            'referenceId': fields_data[10] if fields_data[10] not in ['NA', 'null', ''] else False,
            
            # Additional fields 1-5 (12-16) - for future use
            'additionalField1': fields_data[11] if len(fields_data) > 11 and fields_data[11] not in ['NA', 'null', ''] else False,
            'additionalField2': fields_data[12] if len(fields_data) > 12 and fields_data[12] not in ['NA', 'null', ''] else False,
            'additionalField3': fields_data[13] if len(fields_data) > 13 and fields_data[13] not in ['NA', 'null', ''] else False,
            'additionalField4': fields_data[14] if len(fields_data) > 14 and fields_data[14] not in ['NA', 'null', ''] else False,
            'additionalField5': fields_data[15] if len(fields_data) > 15 and fields_data[15] not in ['NA', 'null', ''] else False,
        }

        # Additional Field 6 (Index 16): Payer Bank Details
        # Format: "Payer Bank Name!Payer Account Number!Payer Bank IFSC!Payer Mobile Number"
        if len(fields_data) > 16 and fields_data[16] not in ['NA', 'null', '']:
            payer_bank_details = fields_data[16].split('!')
            if len(payer_bank_details) >= 4:
                data.update({
                    'payerBankName': payer_bank_details[0] if payer_bank_details[0] != 'NA' else False,
                    'payerAccountNumber': payer_bank_details[1] if payer_bank_details[1] != 'NA' else False,
                    'payerBankIFSC': payer_bank_details[2] if payer_bank_details[2] != 'NA' else False,
                    'payerMobile': payer_bank_details[3] if payer_bank_details[3] != 'NA' else False,
                })

        # Additional Field 7 (Index 17): Transaction Details
        # Format: "Txn Type!Txn Ref Url!NA!Txn Id!NA"
        if len(fields_data) > 17 and fields_data[17] not in ['NA', 'null', '']:
            txn_details = fields_data[17].split('!')
            if len(txn_details) >= 5:
                data.update({
                    'txnType': txn_details[0] if txn_details[0] != 'NA' else False,
                    'txnRefUrl': txn_details[1] if txn_details[1] != 'NA' else False,
                    'txnIdAdditional': txn_details[3] if len(txn_details) > 3 and txn_details[3] != 'NA' else False,
                })

        # Additional Field 8 (Index 18): Payee VPA
        # Format: "Payee VPA!NA!NA"
        if len(fields_data) > 18 and fields_data[18] not in ['NA', 'null', '']:
            payee_details = fields_data[18].split('!')
            if len(payee_details) >= 1:
                data.update({
                    'payeeVPA': payee_details[0] if payee_details[0] != 'NA' else False,
                })

        # Additional Field 9 (Index 19): Payer Account Type
        # Format: "Payer Acc Type!NA!NA!NA!NA"
        if len(fields_data) > 19 and fields_data[19] not in ['NA', 'null', '']:
            payer_acc_details = fields_data[19].split('!')
            if len(payer_acc_details) >= 1:
                data.update({
                    'payerAccountType': payer_acc_details[0] if payer_acc_details[0] != 'NA' else False,
                })

        # Additional Field 10 (Index 20): Payer Name
        # Format: "Payer Name!NA!NA!NA!NA"
        if len(fields_data) > 20 and fields_data[20] not in ['NA', 'null', '']:
            payer_name_details = fields_data[20].split('!')
            if len(payer_name_details) >= 1:
                data.update({
                    'payerName': payer_name_details[0] if payer_name_details[0] != 'NA' else False,
                })

        return data

    @http.route(f'{_get_qr_data_url}/<int:tx_id>', type='jsonrpc', auth='public', csrf=False)
    def hdfc_upi_get_qr_data(self, tx_id, **kwargs):
        """Get QR code data for the transaction (for modal display).
        
        Retrieves or generates QR code data for the specified transaction,
        used by the frontend to display the payment QR code to customers.
        
        Security Notes:
        - csrf=False is justified: JSON-RPC routes don't need CSRF (PY022 exception)
        - auth='public' allows customers to access their own payment QR codes
        - Transaction access is validated by transaction ID ownership
        
        :param int tx_id: The transaction ID
        :param dict kwargs: Additional parameters (unused)
        :return: QR code data with success status and base64 encoded image
        :rtype: dict
        """
        try:
            _logger.info("Getting QR data for transaction: %s", tx_id)

            # Get transaction using exists() to avoid access errors
            tx_sudo = request.env['payment.transaction'].sudo().browse(tx_id).exists()

            if not tx_sudo:
                _logger.warning("Transaction not found: %s", tx_id)
                return {'success': False, 'error': 'Transaction not found'}

            if tx_sudo.provider_code != 'hdfc_upi':
                _logger.warning("Transaction is not HDFC UPI: %s, provider: %s", tx_id, tx_sudo.provider_code)
                return {'success': False, 'error': 'Invalid payment method'}

            # Generate QR code if not already generated
            if not tx_sudo.hdfc_upi_qr_code:
                _logger.info("Generating QR code for transaction: %s", tx_id)
                try:
                    tx_sudo._generate_hdfc_upi_qr_code()
                    _logger.info("QR code generated successfully for transaction: %s", tx_id)
                except Exception as e:
                    _logger.error("Failed to generate QR code: %s", e, exc_info=True)
                    return {'success': False, 'error': 'Failed to generate QR code'}

            # Calculate expiry time in seconds from now
            expiry_seconds = 0
            if tx_sudo.hdfc_upi_qr_expiry:
                now = datetime.now()
                expiry_delta = tx_sudo.hdfc_upi_qr_expiry - now
                expiry_seconds = max(0, int(expiry_delta.total_seconds()))

            # Convert QR code to data URI
            qr_code_data = None
            if tx_sudo.hdfc_upi_qr_code:
                try:
                    # Handle both string and bytes
                    if isinstance(tx_sudo.hdfc_upi_qr_code, bytes):
                        qr_code_base64 = tx_sudo.hdfc_upi_qr_code.decode('utf-8')
                    else:
                        qr_code_base64 = tx_sudo.hdfc_upi_qr_code

                    qr_code_data = f"data:image/png;base64,{qr_code_base64}"
                except Exception as e:
                    _logger.error("Error creating QR code data URI: %s", e, exc_info=True)
                    return {'success': False, 'error': 'Failed to process QR code'}

            # Return QR data
            return {
                'success': True,
                'qr_code': qr_code_data,
                'qr_string': tx_sudo.hdfc_upi_qr_string,
                'reference': tx_sudo.reference,
                'amount': tx_sudo.amount,
                'currency': tx_sudo.currency_id.name,
                'merchant_name': tx_sudo.provider_id.hdfc_upi_merchant_name,
                'expiry_seconds': expiry_seconds
            }

        except Exception as e:
            _logger.exception("Unhandled error getting QR data for transaction %s: %s", tx_id, e)
            return {'success': False, 'error': 'An unexpected error occurred'}

    @http.route(f'{_cancel_transaction_url}/<int:tx_id>', type='jsonrpc', auth='public', csrf=False)
    def hdfc_upi_cancel_transaction(self, tx_id, reason=None, **kwargs):
        """Cancel a payment transaction.
        
        Security Notes:
        - csrf=False is justified: JSON-RPC routes don't need CSRF (PY022 exception)
        - auth='public' allows customers to cancel their own transactions
        - Transaction access is validated by transaction ID ownership

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

        except Exception as e:
            _logger.exception("Error cancelling transaction %s: %s", tx_id, e)
            return {'success': False, 'error': 'An error occurred while cancelling the transaction'}
