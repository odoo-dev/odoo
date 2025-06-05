import logging
import hashlib
import base64
import json
import requests
from datetime import datetime, timedelta
from werkzeug import urls
import pytz

from odoo import api, fields, models, _
from odoo.exceptions import ValidationError, UserError
from odoo.addons.payment import utils as payment_utils
from odoo.tools.image import image_data_uri

_logger = logging.getLogger(__name__)

class PaymentTransaction(models.Model):
    _inherit = 'payment.transaction'
    
    hdfc_upi_order_no = fields.Char(string="HDFC UPI Order Number", readonly=True)
    hdfc_upi_txn_id = fields.Char(string="HDFC UPI Transaction ID", readonly=True)
    hdfc_upi_customer_ref_no = fields.Char(string="HDFC UPI Customer Reference Number", readonly=True)
    hdfc_upi_qr_code = fields.Binary(string="UPI QR Code", attachment=True, readonly=True)
    hdfc_upi_qr_string = fields.Char(string="UPI QR String", readonly=True)
    hdfc_upi_qr_expiry = fields.Datetime(string="QR Code Expiry Time", readonly=True)
    hdfc_upi_payer_vpa = fields.Char(string="Payer VPA", readonly=True)
    hdfc_upi_payer_name = fields.Char(string="Payer Name", readonly=True)

    def _get_specific_processing_values(self, processing_values):
        """ Override of payment to return HDFC UPI-specific processing values.
        
        Note: self.ensure_one() from `_get_processing_values`
        
        :param dict processing_values: The generic processing values of the transaction
        :return: The dict of provider-specific processing values
        :rtype: dict
        """
        res = super()._get_specific_processing_values(processing_values)
        if self.provider_code != 'hdfc_upi':
            return res
        
        _logger.info("Getting processing values for HDFC UPI transaction: %s", self.id)
        
        # Generate QR code immediately for the transaction
        if not self.hdfc_upi_qr_code:
            try:
                self._generate_hdfc_upi_qr_code()
                _logger.info("QR code generated during processing for transaction: %s", self.id)
            except Exception as e:
                _logger.error("Failed to generate QR code during processing: %s", e, exc_info=True)
        
        # Return processing values that will be used by the frontend
        processing_values.update({
            'transaction_id': self.id,
            'merchant_name': self.provider_id.hdfc_upi_merchant_name or 'HDFC UPI',
            'currency_code': self.currency_id.name,
            'bus_channel': self._bus_channel(),
        })
        
        _logger.info("HDFC UPI processing values: %s", processing_values)
        return processing_values
    
    def _generate_hdfc_upi_qr_code(self):
        """ Generate a UPI QR code for the transaction.
        
        :return: None
        """
        self.ensure_one()
        
        if self.hdfc_upi_qr_code and self.hdfc_upi_order_no and self.hdfc_upi_qr_expiry and self.hdfc_upi_qr_expiry > fields.Datetime.now():
            _logger.info("QR code already exists and is valid for transaction: %s", self.id)
            return  # QR code already generated and not expired
        
        _logger.info("Generating QR code for transaction: %s", self.id)
        
        provider = self.provider_id
        
        # Generate unique order number
        order_no = f"PQ{self.reference.replace('/', '')}{int(datetime.now().timestamp())}"
        _logger.info("Generated HDFC UPI order number: %s for transaction: %s", order_no, self.id)
        self.hdfc_upi_order_no = order_no

        # Set QR code expiry time (hardcoded to 5 minutes)
        expiry_minutes = 5
        self.hdfc_upi_qr_expiry = fields.Datetime.now() + timedelta(minutes=expiry_minutes)

        # Format expiry time in the required format for QRexpire parameter
        # Format: YYYY-MM-DDTHH:MM:SS+05.30
        ist = pytz.timezone('Asia/Kolkata')
        expiry_ist = self.hdfc_upi_qr_expiry.astimezone(ist)
        expiry_formatted = expiry_ist.strftime("%Y-%m-%dT%H:%M:%S") + "+05.30"

        # Create QR string as per HDFC specifications
        payment_url = (
            f"upi://pay?ver=01&mode=15"
            f"&tr={order_no}"
            f"&tn=Payment {self.reference}"
            f"&pn={provider.hdfc_upi_merchant_name}"
            f"&pa={provider.company_id.l10n_in_upi_id}"
            f"&mc={provider.hdfc_upi_merchant_category}"
            f"&am={self.amount}"
            f"&cu={self.currency_id.name}"
            f"&qrMedium=06"
            f"&QRexpire={expiry_formatted}"
        )
        
        self.hdfc_upi_qr_string = payment_url
        
        try:
            # Generate QR code using ir.actions.report barcode method
            barcode = self.env['ir.actions.report'].sudo().barcode(
                barcode_type="QR", 
                value=payment_url, 
                width=300, 
                height=300
            )
            
            # Ensure we have binary data
            if not barcode:
                _logger.error("Barcode generation returned empty data for transaction: %s", self.id)
                raise ValidationError(_("Failed to generate QR code: Empty barcode data"))
                
            # Encode as base64 string
            qr_code_base64 = base64.b64encode(barcode)
            
            # Debug info
            _logger.info("QR code generated successfully for transaction: %s, size: %s bytes", 
                        self.id, len(qr_code_base64))
            
            # Store the QR code
            self.hdfc_upi_qr_code = qr_code_base64
            
            # Verify the QR code was stored
            self.env.cr.commit()  # Commit the transaction to ensure QR code is stored
            
        except Exception as e:
            _logger.error("Error generating QR code for transaction %s: %s", self.id, e, exc_info=True)
            raise ValidationError(_("Failed to generate QR code: %s") % e)

    def _send_payment_notification(self, notification_type, message=None):
        """ Send real-time notification via Odoo bus for payment status updates.
        
        Uses the modern bus approach with direct _sendone method
        
        :param str notification_type: Type of notification (success, error, expired, etc.)
        :param str message: Optional custom message
        """
        self.ensure_one()
        if self.provider_code != 'hdfc_upi':
            return
        
        try:
            # Prepare notification payload
            payload = {
                'transaction_id': self.id,
                'state': self.state,
                'state_message': message or self.state_message or '',
                'reference': self.reference,
                'amount': self.amount,
                'currency': self.currency_id.name,
                'notification_type': notification_type,
                'timestamp': fields.Datetime.now().isoformat(),
            }
            
            # Use direct bus._sendone method with string channel
            # Send single notification type for all transaction updates
            channel = f'payment_hdfc_upi_{self.id}'
            self.env['bus.bus']._sendone(channel, 'payment.transaction/updated', payload)
            _logger.info("Sent bus notification for transaction %s: %s", self.id, payload)
            
        except Exception as e:
            _logger.error("Error sending payment notification: %s", e, exc_info=True)
    
    def _get_hdfc_upi_api_url(self, endpoint):
        """ Return the appropriate URL for the requested endpoint.
        
        :param str endpoint: The endpoint to be reached by the API request
        :return: The URL for the requested endpoint
        :rtype: str
        """
        self.ensure_one()
        
        if self.provider_id.state == 'test':
            base_url = 'https://upitestv2.hdfcbank.com/upi'
        else:
            base_url = 'https://upiv2.hdfcbank.com/upi'
        
        endpoints = {
            'status': '/transactionStatusQuery',
            'refund': '/refundReqSvc',
        }
        
        return f"{base_url}{endpoints.get(endpoint, '')}"
    
    def _get_tx_from_notification_data(self, provider_code, notification_data):
        """ Find the transaction based on the notification data.
        
        :param str provider_code: The code of the provider that handled the transaction
        :param dict notification_data: The notification data sent by the provider
        :return: The transaction, if found
        :rtype: recordset of `payment.transaction`
        """
        tx = super()._get_tx_from_notification_data(provider_code, notification_data)
        if provider_code != 'hdfc_upi' or tx:
            return tx
            
        order_no = notification_data.get('order_no')
        if order_no:
            tx = self.search([('hdfc_upi_order_no', '=', order_no)], limit=1)
        
        return tx
    
    def action_check_payment_status(self):
        """ Manual action to check payment status from the backend.
        
        This method is triggered by the 'Check Payment Status' button
        in the payment transaction form view.
        """
        self.ensure_one()
        if self.provider_code != 'hdfc_upi':
            raise UserError(_("This action is only available for HDFC UPI transactions."))
        
        if not self.hdfc_upi_order_no:
            raise UserError(_("Order number is missing. Cannot check payment status."))
        
        try:
            # Check if QR code has expired
            if self._is_qr_expired() and self.state not in ['done', 'cancel', 'error']:
                # Mark transaction as expired
                self._set_canceled("HDFC UPI: QR code has expired.")
                # Send notification for real-time update
                self._send_payment_notification('expired', 'QR code has expired')
                return {
                    'type': 'ir.actions.client',
                    'tag': 'display_notification',
                    'params': {
                        'title': _('QR Code Expired'),
                        'message': _('The QR code for this transaction has expired.'),
                        'type': 'warning'
                    }
                }
            
            # Check payment status with provider
            result = self._check_hdfc_upi_payment_status()
            
            if result:
                # Send notification for real-time update
                self._send_payment_notification('status_updated', f'Payment status: {self.state}')
                
                # Show result notification
                if self.state == 'done':
                    message = _('Payment confirmed successfully!')
                    notification_type = 'success'
                elif self.state in ['cancel', 'error']:
                    message = _('Payment failed or was cancelled.')
                    notification_type = 'warning'
                else:
                    message = _('Payment status updated. Current status: %s') % self.state.title()
                    notification_type = 'info'
                    
                return {
                    'type': 'ir.actions.client',
                    'tag': 'display_notification',
                    'params': {
                        'title': _('Status Check Complete'),
                        'message': message,
                        'type': notification_type
                    }
                }
            else:
                return {
                    'type': 'ir.actions.client',
                    'tag': 'display_notification',
                    'params': {
                        'title': _('Status Check Failed'),
                        'message': _('Unable to retrieve payment status from provider.'),
                        'type': 'warning'
                    }
                }
                
        except Exception as e:
            _logger.error("Error in manual payment status check: %s", e, exc_info=True)
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': _('Error'),
                    'message': _('An error occurred while checking payment status: %s') % str(e),
                    'type': 'danger'
                }
            }

    def _process_notification_data(self, notification_data):
        """ Override of payment to process the transaction based on notification data.
        
        :param dict notification_data: The notification data sent by the provider
        :return: None
        """
        super()._process_notification_data(notification_data)
        if self.provider_code != 'hdfc_upi':
            return
        
        # Extract data from notification
        status = notification_data.get('status')
        upi_txn_id = notification_data.get('upi_txn_id')
        customer_ref_no = notification_data.get('customer_ref_no')
        payer_vpa = notification_data.get('payer_vpa')
        payer_name = notification_data.get('payer_name')
        
        # Update transaction fields
        vals = {
            'hdfc_upi_txn_id': upi_txn_id,
            'hdfc_upi_customer_ref_no': customer_ref_no,
            'hdfc_upi_payer_vpa': payer_vpa,
            'hdfc_upi_payer_name': payer_name,
        }
        
        # Update transaction state based on status
        if status and status.upper() == 'SUCCESS':
            _logger.info("Payment successful for transaction %s", self.reference)
            if vals:
                self.write(vals)
            self._set_done()
            self._send_payment_notification('done', 'Payment completed successfully')
        elif status and status.upper() == 'FAILED':
            error_msg = notification_data.get('response_message') or _("Payment failed.")
            _logger.info("Payment failed for transaction %s: %s", self.reference, error_msg)
            if vals:
                self.write(vals)
            self._set_canceled(f"HDFC UPI: {error_msg}")
            self._send_payment_notification('error', error_msg)
        elif status and status.upper() == 'REJECTED':
            error_msg = notification_data.get('response_message') or _("Payment was rejected.")
            _logger.info("Payment rejected for transaction %s: %s", self.reference, error_msg)
            if vals:
                self.write(vals)
            self._set_canceled(f"HDFC UPI: {error_msg}")
            self._send_payment_notification('error', error_msg)
        elif status and status.upper() == 'PENDING':
            _logger.info("Payment pending for transaction %s", self.reference)
            if vals:
                self.write(vals)
            self._set_pending()
            self._send_payment_notification('pending', 'Payment is being processed')
        elif status and status.upper() == 'EXPIRED':
            _logger.info("Payment expired for transaction %s", self.reference)
            if vals:
                self.write(vals)
            self._set_canceled(_("HDFC UPI: QR code has expired."))
            self._send_payment_notification('expired', 'QR code has expired')
        else:
            _logger.warning("Received unrecognized payment status for transaction %s: %s", 
                           self.reference, status)
            if vals:
                self.write(vals)
            self._send_payment_notification('error', f'Unknown status: {status}')
    
    def _send_refund_request(self, amount_to_refund=None):
        """ Override of payment to send a refund request to HDFC UPI.
        
        :param float amount_to_refund: The amount to refund
        :return: The refund transaction
        :rtype: recordset of `payment.transaction`
        """
        self.ensure_one()
        if self.provider_code != 'hdfc_upi':
            return super()._send_refund_request(amount_to_refund)
        
        # Check if transaction can be refunded
        if not self.hdfc_upi_txn_id or not self.hdfc_upi_order_no or not self.hdfc_upi_customer_ref_no:
            raise ValidationError(_("Missing transaction details. Cannot process refund."))
        
        # Prepare refund data
        refund_amount = amount_to_refund or self.amount
        provider = self.provider_id
        merchant_id = provider.hdfc_upi_merchant_id
        encryption_key = provider.hdfc_upi_encryption_key
        
        # Generate refund order number
        refund_order_no = f"RF{self.reference.replace('/', '')}{int(datetime.now().timestamp())}"
        
        # Prepare request message
        request_message = (
            f"{merchant_id}|{refund_order_no}|{self.hdfc_upi_order_no}|{self.hdfc_upi_txn_id}|"
            f"{self.hdfc_upi_customer_ref_no}|Refund for {self.reference}|{refund_amount}|"
            f"{self.currency_id.name}|P2P|PAY|||||||||NA|NA"
        )
        
        # Encrypt the request message
        encrypted_message = self._encrypt_hdfc_upi_message(request_message, encryption_key)
        
        # Prepare JSON payload
        payload = {
            "requestMsg": encrypted_message,
            "pgMerchantId": merchant_id
        }
        
        # Make API request
        api_url = self._get_hdfc_upi_api_url('refund')
        try:
            response = requests.post(api_url, json=payload, verify=True)
            
            if response.status_code == 200:
                # Decrypt response
                decrypted_response = self._decrypt_hdfc_upi_message(response.text, encryption_key)
                
                # Process refund response
                return self._process_hdfc_upi_refund_response(decrypted_response, refund_amount)
            else:
                _logger.error("Error processing refund: %s", response.text)
                raise ValidationError(_("Failed to process refund. Please try again later."))
        
        except Exception as e:
            _logger.error("Error processing refund: %s", e)
            raise ValidationError(_("Failed to process refund: %s") % e)
    
    def _process_hdfc_upi_refund_response(self, response_text, refund_amount):
        """ Process the refund response from HDFC UPI.
        
        :param str response_text: The decrypted response from HDFC UPI
        :param float refund_amount: The amount that was refunded
        :return: The refund transaction
        :rtype: recordset of `payment.transaction`
        """
        self.ensure_one()
        
        if not response_text:
            raise ValidationError(_("Empty response from payment provider."))
        
        # Parse pipe-separated response
        fields_data = response_text.split('|')
        
        if len(fields_data) < 7:
            _logger.error("Invalid refund response format: %s", response_text)
            raise ValidationError(_("Invalid response format from payment provider."))
        
        # Extract relevant fields
        org_txn_ref = fields_data[0]
        refund_order_no = fields_data[1]
        refund_amount_str = fields_data[2]
        txn_date_str = fields_data[3]
        status = fields_data[4]
        status_desc = fields_data[5]
        response_code = fields_data[6]
        
        # Check if refund was successful
        if status.upper() != 'S' and status.upper() != 'SUCCESS':
            error_message = f"Refund failed: {status_desc} ({response_code})"
            _logger.error(error_message)
            raise ValidationError(_(error_message))
        
        # Create refund transaction
        refund_tx_vals = {
            'provider_id': self.provider_id.id,
            'reference': f"R-{self.reference}",
            'amount': -float(refund_amount),
            'currency_id': self.currency_id.id,
            'partner_id': self.partner_id.id,
            'operation': 'refund',
            'source_transaction_id': self.id,
            'hdfc_upi_order_no': refund_order_no,
        }
        
        refund_tx = self.env['payment.transaction'].create(refund_tx_vals)
        refund_tx._set_done()
        
        return refund_tx
    
    def _encrypt_hdfc_upi_message(self, message, key):
        """ Encrypt message using AES-128 encryption.
        
        :param str message: The message to encrypt
        :param str key: The encryption key
        :return: The encrypted message as a hex string
        :rtype: str
        """
        try:
            from Crypto.Cipher import AES
            from Crypto.Util.Padding import pad
            
            # Convert key to bytes and create hash
            key_bytes = key.encode('utf-8')
            key_hash = hashlib.md5(key_bytes).digest()
            
            # Create cipher and encrypt
            cipher = AES.new(key_hash, AES.MODE_ECB)
            message_bytes = message.encode('utf-8')
            padded_message = pad(message_bytes, AES.block_size)
            encrypted = cipher.encrypt(padded_message)
            
            # Convert to hex string
            return encrypted.hex().upper()
        
        except Exception as e:
            _logger.error("Encryption error: %s", e)
            raise ValidationError(_("Encryption failed: %s") % e)
    
    def _decrypt_hdfc_upi_message(self, encrypted_message, key):
        """ Decrypt message using AES-128 decryption.
        
        :param str encrypted_message: The encrypted message as a hex string
        :param str key: The encryption key
        :return: The decrypted message
        :rtype: str
        """
        try:
            if not encrypted_message:
                _logger.error("No encrypted message provided for decryption.")
                raise ValidationError(_("No encrypted message provided for decryption."))
            from Crypto.Cipher import AES
            from Crypto.Util.Padding import unpad
            # Convert key to bytes and create hash
            key_bytes = key.encode('utf-8')
            key_hash = hashlib.md5(key_bytes).digest()
            # Create cipher and decrypt
            cipher = AES.new(key_hash, AES.MODE_ECB)
            encrypted_bytes = bytes.fromhex(encrypted_message)
            if not encrypted_bytes:
                _logger.error("Encrypted message is empty after hex decoding.")
                raise ValidationError(_("Encrypted message is empty after hex decoding."))
            decrypted_padded = cipher.decrypt(encrypted_bytes)
            # Remove padding and convert to string
            decrypted = unpad(decrypted_padded, AES.block_size)
            return decrypted.decode('utf-8')
        except Exception as e:
            _logger.error("Decryption error: %s", e)
            raise ValidationError(_("Decryption failed: %s") % e)
    
    def _check_hdfc_upi_payment_status(self):
        """ Check the status of a HDFC UPI payment.
        
        :return: True if status check was successful, False otherwise
        :rtype: bool
        """
        self.ensure_one()
        _logger.info("Status Checking from API")
        if not self.hdfc_upi_order_no:
            raise ValidationError(_("Order number is missing. Cannot check payment status."))
        
        provider = self.provider_id
        merchant_id = provider.hdfc_upi_merchant_id
        encryption_key = provider.hdfc_upi_encryption_key
        
        # Prepare request message
        request_message = f"{merchant_id}|{self.hdfc_upi_order_no}|||||||||||NA|NA"
        
        # Encrypt the request message
        encrypted_message = self._encrypt_hdfc_upi_message(request_message, encryption_key)
        
        # Prepare JSON payload
        payload = {
            "requestMsg": encrypted_message,
            "pgMerchantId": merchant_id
        }
        
        # Make API request
        api_url = self._get_hdfc_upi_api_url('status')
        try:
            response = requests.post(api_url, json=payload, verify=True)
            
            if response.status_code == 200:
                # Decrypt response
                decrypted_response = self._decrypt_hdfc_upi_message(response.text, encryption_key)
                
                # Parse response and extract data
                fields_data = decrypted_response.split('|')
                
                if len(fields_data) < 10:
                    _logger.error("Invalid status response format: %s", decrypted_response)
                    return False
                
                # Extract data
                data = {
                    'upi_txn_id': fields_data[0] if fields_data[0] != 'NA' else False,
                    'order_no': fields_data[1],
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
                self._process_notification_data(data)
                return True
            
            else:
                _logger.error("Error checking payment status: %s", response.text)
                return False
        
        except Exception as e:
            _logger.error("Error checking payment status: %s", e)
            return False
    
    def _bus_channel(self):
        """Return the bus channel for this payment transaction.
        
        :return: The bus channel name
        :rtype: str
        """
        self.ensure_one()
        return f'payment_hdfc_upi_{self.id}'

    def _is_qr_expired(self):
        """Check if the QR code has expired.
        
        :return: True if expired, False otherwise
        :rtype: bool
        """
        self.ensure_one()
        
        if not self.hdfc_upi_qr_expiry:
            return True
            
        return fields.Datetime.now() > self.hdfc_upi_qr_expiry
