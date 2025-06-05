import logging
import pprint
import werkzeug
import json
import base64
from datetime import datetime

from odoo import http, tools
from odoo.exceptions import ValidationError, AccessError
from odoo.http import request

_logger = logging.getLogger(__name__)

class HdfcUpiController(http.Controller):
    
    @http.route('/payment/hdfc_upi/callback', type='http', auth='public', csrf=False, methods=['POST'])
    def hdfc_upi_callback(self, **post):
        """ Process the notification data sent by HDFC UPI after a transaction."""
        _logger.info("Received HDFC UPI callback: %s", pprint.pformat(post))
        
        # Get parameters
        encrypted_response = post.get('meRes')
        merchant_id = post.get('pgMerchantId')
        
        if not encrypted_response or not merchant_id:
            _logger.error("Invalid callback parameters")
            return werkzeug.wrappers.Response(status=400)
        
        try:
            # Find the payment provider by merchant ID
            provider = request.env['payment.provider'].sudo().search([
                ('code', '=', 'hdfc_upi'),
                ('hdfc_upi_merchant_id', '=', merchant_id)
            ], limit=1)
            
            if not provider:
                _logger.error("Payment provider not found for merchant ID: %s", merchant_id)
                return werkzeug.wrappers.Response(status=404)
            
            encryption_key = provider.hdfc_upi_encryption_key
            
            if not encryption_key:
                _logger.error("Encryption key not configured for provider: %s", provider.name)
                return werkzeug.wrappers.Response(status=500)
            
            # Decrypt response
            tx_sudo = request.env['payment.transaction'].sudo()
            decrypted_response = tx_sudo._decrypt_hdfc_upi_message(encrypted_response, encryption_key)
            
            # Process callback response
            self._process_callback_response(decrypted_response, provider)
            
            # Return success response
            return werkzeug.wrappers.Response(status=200)
            
        except Exception as e:
            _logger.error("Error processing UPI callback: %s", e)
            return werkzeug.wrappers.Response(status=500)
    
    def _process_callback_response(self, response_text, provider):
        """ Process the callback response from HDFC Bank.
        
        :param str response_text: The decrypted response text
        :param recordset provider: The payment provider
        :return: None
        """
        if not response_text:
            return False
        
        # Parse pipe-separated response
        fields_data = response_text.split('|')
        
        if len(fields_data) < 10:
            _logger.error("Invalid callback response format: %s", response_text)
            return False
        
        # Extract order number (merchant transaction reference)
        upi_txn_id = fields_data[0]
        order_no = fields_data[1]
        
        if not order_no:
            _logger.error("Order number missing in callback response")
            return False
        
        # Find the payment transaction
        tx_sudo = request.env['payment.transaction'].sudo().search([
            ('provider_id', '=', provider.id),
            ('hdfc_upi_order_no', '=', order_no)
        ], limit=1)
        
        if not tx_sudo:
            _logger.error("Payment transaction not found for order number: %s", order_no)
            return False
        
        # Extract data
        data = {
            'upi_txn_id': upi_txn_id if upi_txn_id != 'NA' else False,
            'order_no': order_no,
            'amount': fields_data[2],
            'txn_date': fields_data[3],
            'status': fields_data[4],
            'response_message': fields_data[5],
            'response_code': fields_data[6],
            'payer_vpa': fields_data[8] if fields_data[8] != 'NA' else False,
            'customer_ref_no': fields_data[9] if fields_data[9] != 'NA' else False,
        }
        
        # Extract payer details if available
        if len(fields_data) > 16:
            payer_details = fields_data[16].split('!')
            if len(payer_details) >= 4:
                data.update({
                    'payer_name': payer_details[0] if payer_details[0] != 'NA' else False,
            })
        
        # Process the notification data
        tx_sudo._process_notification_data(data)
        return True
    
    @http.route('/payment/hdfc_upi/check_status/<int:tx_id>', type='jsonrpc', auth='public', csrf=False)
    def hdfc_upi_check_status(self, tx_id, **kwargs):
        """ Check the status of a payment transaction.
        
        :param int tx_id: The transaction ID
        :return: The status of the transaction
        :rtype: dict
        """
        _logger.info("Checking payment status for transaction: %s", tx_id)
        tx_sudo = request.env['payment.transaction'].sudo().browse(tx_id).exists()
        if not tx_sudo or tx_sudo.provider_code != 'hdfc_upi':
            _logger.error("Transaction not found or not HDFC UPI: %s", tx_id)
            return {'error': 'Transaction not found'}
        
        try:
            # Check if QR code has expired
            if tx_sudo._is_qr_expired() and tx_sudo.state not in ['done', 'cancel', 'error']:
                # Mark transaction as expired
                tx_sudo._set_canceled("HDFC UPI: QR code has expired.")
                _logger.info("QR code expired for transaction: %s", tx_id)
                return {
                    'success': True,
                    'state': 'cancel',
                    'message': "QR code has expired.",
                    'expired': True
                }
            
            # Check payment status with provider
            result = tx_sudo._check_hdfc_upi_payment_status()
            _logger.info("Payment status check result for transaction %s: %s, state: %s", 
                        tx_id, result, tx_sudo.state)
            return {
                'success': result,
                'state': tx_sudo.state,
                'message': tx_sudo.state_message or '',
                'expired': False
            }
        except ValidationError as e:
            _logger.error("Validation error checking payment status: %s", e)
            return {'error': str(e)}
        except Exception as e:
            _logger.exception("Error checking payment status: %s", e)
            return {'error': 'An error occurred while checking payment status'}

    @http.route('/payment/hdfc_upi/get_qr_data/<int:tx_id>', type='jsonrpc', auth='public', csrf=False)
    def hdfc_upi_get_qr_data(self, tx_id, **kwargs):
        """ Get QR code data for the transaction (for modal display).
        
        :param int tx_id: The transaction ID
        :return: QR code data
        :rtype: dict
        """
        try:
            _logger.info("Getting QR data for transaction: %s", tx_id)
            
            # Get transaction with sudo to avoid access rights issues
            tx_sudo = request.env['payment.transaction'].sudo().browse(tx_id).exists()
            
            if not tx_sudo:
                _logger.error("Transaction not found: %s", tx_id)
                return {'success': False, 'error': 'Transaction not found'}
                
            if tx_sudo.provider_code != 'hdfc_upi':
                _logger.error("Transaction is not HDFC UPI: %s, provider: %s", tx_id, tx_sudo.provider_code)
                return {'success': False, 'error': 'Invalid payment method'}
            
            # Generate QR code if not already generated
            if not tx_sudo.hdfc_upi_qr_code:
                _logger.info("Generating QR code for transaction: %s", tx_id)
                try:
                    tx_sudo._generate_hdfc_upi_qr_code()
                    _logger.info("QR code generated successfully for transaction: %s", tx_id)
                except Exception as e:
                    _logger.error("Failed to generate QR code: %s", e, exc_info=True)
                    return {'success': False, 'error': f"Failed to generate QR code: {str(e)}"}
            
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
                    _logger.info("QR code data URI created successfully")
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
                'expiry_seconds': expiry_seconds,
                'bus_channel': tx_sudo._bus_channel()
            }
        
        except Exception as e:
            _logger.error("Unhandled error getting QR data: %s", e, exc_info=True)
            return {'success': False, 'error': 'An unexpected error occurred'}
    
    @http.route('/payment/hdfc_upi/get_form/<int:tx_id>', type='http', auth='public')
    def hdfc_upi_get_form(self, tx_id, **kwargs):
        """ Return the QR code payment form for the transaction.
        
        This is kept for backward compatibility but now mainly used for direct access.
        """
        try:
            _logger.info("Received request for QR form for transaction: %s", tx_id)
            
            # Get transaction with sudo to avoid access rights issues
            tx_sudo = request.env['payment.transaction'].sudo().browse(tx_id).exists()
            
            if not tx_sudo:
                _logger.error("Transaction not found: %s", tx_id)
                return self._render_error_page("Transaction not found")
                
            if tx_sudo.provider_code != 'hdfc_upi':
                _logger.error("Transaction is not HDFC UPI: %s, provider: %s", tx_id, tx_sudo.provider_code)
                return self._render_error_page("Invalid payment method")
            
            # For direct access, redirect to payment status to use the modal flow
            return request.redirect('/payment/status')
        
        except Exception as e:
            _logger.error("Unhandled error displaying QR form: %s", e, exc_info=True)
            return self._render_error_page("An unexpected error occurred")
    
    def _render_error_page(self, error_message):
        """Render a simple error page with the given message.
        
        :param str error_message: The error message to display
        :return: The rendered error page
        """
        _logger.error("Rendering error page: %s", error_message)
        html = f"""
        <!DOCTYPE html>
        <html>
            <head>
                <meta charset="utf-8"/>
                <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no"/>
                <title>Payment Error</title>
                <style>
                    body {{ font-family: Arial, sans-serif; margin: 50px; }}
                    .error-container {{ max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }}
                    .error-title {{ color: #d9534f; }}
                    .back-button {{ margin-top: 20px; }}
                    .back-button a {{ text-decoration: none; color: #337ab7; }}
                </style>
            </head>
            <body>
                <div class="error-container">
                    <h2 class="error-title">Payment Error</h2>
                    <p>{error_message}</p>
                    <div class="back-button">
                        <a href="/payment/status">&larr; Return to Payment Status</a>
                    </div>
                </div>
            </body>
        </html>
        """
        return html
