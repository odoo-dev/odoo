# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64
import hashlib
import json
import logging
import pytz
import re
import requests
from datetime import datetime, timedelta

from werkzeug import urls

from odoo import _, api, fields, models
from odoo.exceptions import UserError, ValidationError

from odoo.addons.payment import utils as payment_utils
from odoo.addons.payment_hdfc_upi_qr import const
from odoo.addons.payment_hdfc_upi_qr import utils as hdfc_upi_utils
from odoo.tools.image import image_data_uri

_logger = logging.getLogger(__name__)


class PaymentTransaction(models.Model):
    _inherit = 'payment.transaction'

    # HDFC UPI specific fields
    hdfc_upi_order_no = fields.Char(string="HDFC UPI Order Number", readonly=True)
    hdfc_upi_txn_id = fields.Char(string="HDFC UPI Transaction ID", readonly=True)
    hdfc_upi_customer_ref_no = fields.Char(string="HDFC UPI Customer Reference Number", readonly=True)
    hdfc_upi_qr_code = fields.Binary(string="UPI QR Code", attachment=True, readonly=True)
    hdfc_upi_qr_string = fields.Char(string="UPI QR String", readonly=True)
    hdfc_upi_qr_expiry = fields.Datetime(string="QR Code Expiry Time", readonly=True)
    hdfc_upi_payer_vpa = fields.Char(string="Payer VPA", readonly=True)
    hdfc_upi_payer_name = fields.Char(string="Payer Name", readonly=True)

    def _get_specific_processing_values(self, processing_values):
        """Override of payment to return HDFC UPI-specific processing values.

        Note: self.ensure_one() from `_get_processing_values`

        :param dict processing_values: The generic processing values of the transaction
        :return: The dict of provider-specific processing values
        :rtype: dict
        """
        res = super()._get_specific_processing_values(processing_values)
        if self.provider_code != 'hdfc_upi':
            return res

        _logger.info("Getting processing values for HDFC UPI transaction: %s", self.id)

        # Validate transaction before processing
        self._hdfc_upi_validate_transaction()

        # Generate QR code immediately for the transaction
        if not self.hdfc_upi_qr_code:
            try:
                self._generate_hdfc_upi_qr_code()
                _logger.info("QR code generated during processing for transaction: %s", self.id)
            except Exception as e:
                _logger.error("Failed to generate QR code during processing: %s", e, exc_info=True)
                raise ValidationError(_("Failed to generate QR code: %s") % str(e))

        # Get inline form values for the payment form
        inline_form_values = self.provider_id._hdfc_upi_get_inline_form_values(
            amount=self.amount,
            currency=self.currency_id,
            reference=self.reference
        )

        # Return processing values that will be used by the frontend
        processing_values.update({
            'transaction_id': self.id,
            'merchant_name': self.provider_id.hdfc_upi_merchant_name or 'HDFC UPI',
            'currency_code': self.currency_id.name,
            'redirect_to_status': True,  # Enable standard Odoo payment polling
            'inline_form_values': inline_form_values,
        })

        _logger.info("HDFC UPI processing values prepared for transaction: %s", self.reference)
        return processing_values

    def _hdfc_upi_validate_transaction(self):
        """Validate transaction parameters for HDFC UPI processing.
        
        :raises ValidationError: If validation fails
        """
        self.ensure_one()
        
        # Currency validation
        if self.currency_id.name != 'INR':
            raise ValidationError(_(
                "HDFC UPI only supports Indian Rupee (INR) currency. "
                "Current transaction currency: %s"
            ) % self.currency_id.name)
        
        # Amount validation using utility function
        is_valid, error_message = hdfc_upi_utils.validate_transaction_amount(
            self.amount, self.currency_id.name
        )
        if not is_valid:
            raise ValidationError(_("HDFC UPI: %s") % error_message)
        
        # Provider configuration validation
        if not self.provider_id.hdfc_upi_merchant_id:
            raise ValidationError(_("HDFC UPI Merchant ID is not configured"))
        
        if not self.provider_id.company_id.l10n_in_upi_id:
            raise ValidationError(_("Company UPI VPA is not configured"))
        
        # Validate UPI VPA format
        merchant_vpa = self.provider_id.company_id.l10n_in_upi_id
        if not hdfc_upi_utils.validate_upi_vpa(merchant_vpa):
            raise ValidationError(_("Invalid UPI VPA format: %s") % merchant_vpa)

    def _generate_hdfc_upi_qr_code(self):
        """Generate a UPI QR code for the transaction.
        
        Creates a QR code containing UPI payment information following HDFC Bank
        specifications.
        
        :raises ValidationError: If QR code generation fails
        """
        self.ensure_one()
        
        # Use validation method instead of duplicating validation logic
        self._hdfc_upi_validate_transaction()

        # Check if QR code already exists and is still valid
        if (self.hdfc_upi_qr_code and self.hdfc_upi_order_no and 
            self.hdfc_upi_qr_expiry and self.hdfc_upi_qr_expiry > fields.Datetime.now() and
            self.hdfc_upi_qr_string):
            _logger.info("QR code already exists and is valid for transaction: %s", self.reference)
            return

        try:
            # Generate unique order number using utility function
            if not self.hdfc_upi_order_no:
                self.hdfc_upi_order_no = hdfc_upi_utils.generate_transaction_reference('PQ')

            # Get merchant details
            merchant_vpa = self.provider_id.company_id.l10n_in_upi_id
            merchant_name = hdfc_upi_utils.sanitize_merchant_name(
                self.provider_id.hdfc_upi_merchant_name or self.company_id.name
            )
            
            # Build UPI URL using utility function
            upi_url = hdfc_upi_utils.build_upi_url(
                transaction_ref=self.hdfc_upi_order_no,
                amount=self.amount,
                payee_name=merchant_name,
                payee_vpa=merchant_vpa,
                merchant_category=self.provider_id.hdfc_upi_merchant_category or '0000'
            )
            
            # Set QR expiry time
            expiry_minutes = const.QR_CODE_CONFIG['expiry_minutes']
            self.hdfc_upi_qr_expiry = fields.Datetime.now() + timedelta(minutes=expiry_minutes)
            
            # Store UPI URL for QR generation
            self.hdfc_upi_qr_string = upi_url
            
            # Generate actual QR code image
            try:
                # Generate QR code using ir.actions.report barcode method
                barcode = self.env['ir.actions.report'].sudo().barcode(
                    barcode_type="QR", 
                    value=upi_url, 
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
                
            except ImportError:
                _logger.warning("QR code library not available, QR code image not generated")
            except Exception as qr_error:
                _logger.error("Failed to generate QR code image: %s", qr_error)
            
            _logger.info(
                "Generated UPI QR code for transaction %s with amount ₹%s", 
                self.reference, self.amount
            )
            
        except Exception as e:
            _logger.exception("Failed to generate QR code for transaction %s", self.reference)
            raise ValidationError(_("Failed to generate UPI QR code: %s") % str(e))

    def _hdfc_upi_make_request(self, endpoint, payload=None, timeout=None):
        """Make a request to HDFC UPI API with proper error handling.
        
        :param str endpoint: API endpoint
        :param dict payload: Request payload
        :param float timeout: Request timeout in seconds
        :return: Response data
        :rtype: dict
        :raises ValidationError: If request fails
        """
        self.ensure_one()
        
        # Use default timeout if not specified
        if timeout is None:
            timeout = const.API_CONFIG['timeout']
        
        # Prepare request
        url = self.provider_id._hdfc_upi_get_api_url(endpoint)
        headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        }
        
        # Add authentication headers if required
        if hasattr(self.provider_id, '_hdfc_upi_get_auth_headers'):
            headers.update(self.provider_id._hdfc_upi_get_auth_headers())
        
        try:
            _logger.info("Making request to HDFC UPI API: %s", endpoint)
            
            if payload:
                response = requests.post(
                    url, 
                    json=payload, 
                    headers=headers, 
                    timeout=timeout
                )
            else:
                response = requests.get(
                    url, 
                    headers=headers, 
                    timeout=timeout
                )
            
            response.raise_for_status()
            
            try:
                response_data = response.json()
            except ValueError:
                response_data = {'raw_response': response.text}
            
            _logger.info("HDFC UPI API response received for transaction: %s", self.reference)
            return response_data
            
        except requests.exceptions.Timeout:
            error_msg = _("Request timeout while communicating with HDFC UPI")
            _logger.error("%s for transaction: %s", error_msg, self.reference)
            raise ValidationError(error_msg)
            
        except requests.exceptions.ConnectionError:
            error_msg = _("Connection error while communicating with HDFC UPI")
            _logger.error("%s for transaction: %s", error_msg, self.reference)
            raise ValidationError(error_msg)
            
        except requests.exceptions.HTTPError as e:
            error_msg = _("HTTP error %s while communicating with HDFC UPI") % e.response.status_code
            _logger.error("%s for transaction: %s", error_msg, self.reference)
            raise ValidationError(error_msg)
            
        except Exception as e:
            error_msg = _("Unexpected error while communicating with HDFC UPI: %s") % str(e)
            _logger.exception("%s for transaction: %s", error_msg, self.reference)
            raise ValidationError(error_msg)

    def _send_refund_request(self, amount_to_refund=None):
        """Override of payment to send a refund request to HDFC UPI.

        Note: self.ensure_one()

        :param float amount_to_refund: The amount to refund
        :return: The refund transaction created to process the refund request.
        :rtype: recordset of `payment.transaction`
        """
        refund_tx = super()._send_refund_request(amount_to_refund=amount_to_refund)
        if self.provider_code != 'hdfc_upi':
            return refund_tx

        # Validate refund request before processing
        self._hdfc_upi_validate_refund_request(refund_tx)

        try:
            # Prepare refund payload
            refund_payload = self._hdfc_upi_prepare_refund_payload(refund_tx)
            
            # Make refund request to HDFC UPI API
            response_data = refund_tx._hdfc_upi_make_request(
                endpoint='refund',
                payload=refund_payload
            )
            
            _logger.info(
                "Refund request response for transaction %s: %s",
                self.reference, response_data
            )
            
            # Process refund response
            self._hdfc_upi_process_refund_response(refund_tx, response_data)
            
        except Exception as e:
            _logger.exception("Refund request failed for transaction %s: %s", self.reference, e)
            refund_tx._set_error(
                "HDFC UPI: " + _("Refund request failed: %s") % str(e)
            )

        return refund_tx

    def _hdfc_upi_validate_refund_request(self, refund_tx):
        """Validate refund request parameters.
        
        :param payment.transaction refund_tx: The refund transaction
        :raises ValidationError: If validation fails
        """
        self.ensure_one()
        
        # Check if transaction is eligible for refund
        if self.state != 'done':
            raise ValidationError(_("Cannot refund a transaction that is not completed"))
        
        if not self.provider_reference:
            raise ValidationError(_("Cannot refund transaction without provider reference"))
        
        # Validate refund amount
        if refund_tx.amount <= 0:
            raise ValidationError(_("Refund amount must be positive"))
        
        if refund_tx.amount > self.amount:
            raise ValidationError(_("Refund amount cannot exceed original transaction amount"))
        
        # Check if refund is within allowed time limit (if any)
        refund_time_limit = const.REFUND_CONFIG.get('time_limit_days')
        if refund_time_limit:
            max_refund_date = self.create_date + timedelta(days=refund_time_limit)
            if fields.Datetime.now() > max_refund_date:
                raise ValidationError(
                    _("Refund request is beyond the allowed time limit of %d days") % refund_time_limit
                )
        
        _logger.info("Refund validation passed for transaction: %s", self.reference)

    def _hdfc_upi_prepare_refund_payload(self, refund_tx):
        """Prepare refund request payload for HDFC UPI API.
        
        :param payment.transaction refund_tx: The refund transaction
        :return: The refund request payload
        :rtype: dict
        """
        self.ensure_one()
        
        # Generate refund reference
        refund_reference = hdfc_upi_utils.generate_refund_reference(self.reference)
        refund_tx.hdfc_upi_order_no = refund_reference
        
        payload = {
            'merchantId': self.provider_id.hdfc_upi_merchant_id,
            'originalTransactionId': self.provider_reference or self.hdfc_upi_txn_id,
            'originalOrderNo': self.hdfc_upi_order_no,
            'refundOrderNo': refund_reference,
            'refundAmount': hdfc_upi_utils.format_upi_amount(refund_tx.amount),
            'currency': refund_tx.currency_id.name,
            'reason': 'Customer Request',
            'timestamp': datetime.now().strftime('%Y%m%d%H%M%S'),
        }
        
        # Add encryption if required
        if hasattr(self.provider_id, 'hdfc_upi_encryption_key') and self.provider_id.hdfc_upi_encryption_key:
            payload = hdfc_upi_utils.encrypt_payload(payload, self.provider_id.hdfc_upi_encryption_key)
        
        _logger.info("Prepared refund payload for transaction: %s", self.reference)
        return payload

    def _hdfc_upi_process_refund_response(self, refund_tx, response_data):
        """Process refund response from HDFC UPI API.
        
        :param payment.transaction refund_tx: The refund transaction
        :param dict response_data: The API response data
        """
        self.ensure_one()
        
        if not response_data:
            raise ValidationError(_("Empty response received from HDFC UPI refund API"))
        
        # Parse response using utility function
        parsed_response = hdfc_upi_utils.parse_hdfc_response(response_data)
        
        if parsed_response.get('success'):
            # Refund request accepted
            refund_status = parsed_response.get('status', '').upper()
            refund_tx_id = parsed_response.get('transaction_id')
            
            # Update refund transaction with response data
            update_vals = {
                'provider_reference': refund_tx_id or parsed_response.get('refund_id'),
                'hdfc_upi_txn_id': refund_tx_id,
            }
            
            if refund_status in ['SUCCESS', 'COMPLETED']:
                # Refund completed immediately
                refund_tx.write(update_vals)
                refund_tx._set_done()
                _logger.info("Refund completed for transaction: %s", self.reference)
                
            elif refund_status in ['PENDING', 'PROCESSING']:
                # Refund is being processed
                refund_tx.write(update_vals)
                refund_tx._set_pending()
                _logger.info("Refund is being processed for transaction: %s", self.reference)
                
            else:
                # Unknown status, set as pending and log
                refund_tx.write(update_vals)
                refund_tx._set_pending()
                _logger.warning(
                    "Unknown refund status '%s' for transaction: %s",
                    refund_status, self.reference
                )
        else:
            # Refund request failed
            error_message = parsed_response.get('message', 'Unknown error')
            _logger.error("Refund request failed for transaction %s: %s", self.reference, error_message)
            refund_tx._set_error("HDFC UPI: " + error_message)

    def action_check_payment_status(self):
        """Action to manually check payment status with HDFC UPI.
        
        This action can be triggered from the transaction form view.
        
        :return: Action result or None
        """
        self.ensure_one()
        
        if self.provider_code != 'hdfc_upi':
            return
        
        if self.state in ['done', 'cancel']:
            raise UserError(_("Payment status check is not needed for completed or cancelled transactions"))
        
        try:
            success = self._hdfc_upi_check_payment_status()
            
            if success:
                message = _("Payment status updated successfully")
                message_type = 'success'
            else:
                message = _("Payment status check completed but no changes were made")
                message_type = 'info'
                
        except Exception as e:
            _logger.exception("Manual status check failed for transaction: %s", self.reference)
            message = _("Payment status check failed: %s") % str(e)
            message_type = 'danger'
        
        # Return notification to user
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _("Payment Status Check"),
                'message': message,
                'type': message_type,
                'sticky': False,
            }
        }

    def _hdfc_upi_check_payment_status(self):
        """Check the status of a HDFC UPI payment.
        
        Enhanced status checking with better error handling and validation.
        
        :return: True if status check was successful, False otherwise
        :rtype: bool
        """
        self.ensure_one()
        
        if self.provider_code != 'hdfc_upi':
            return False
        
        if not self.hdfc_upi_order_no:
            _logger.warning("No order number available for status check: %s", self.reference)
            return False
        
        try:
            # Prepare status check payload
            payload = {
                'orderNo': self.hdfc_upi_order_no,
                'merchantId': self.provider_id.hdfc_upi_merchant_id,
                'timestamp': datetime.now().strftime('%Y%m%d%H%M%S'),
            }
            
            # Make API request
            response_data = self._hdfc_upi_make_request('check_status', payload)
            
            # Process response
            if response_data and 'status' in response_data:
                odoo_state = hdfc_upi_utils.map_hdfc_status_to_odoo_state(
                    response_data['status']
                )
                
                if odoo_state:
                    self._process_notification_data(response_data)
                    return True
            
            _logger.warning("Invalid status response for transaction: %s", self.reference)
            return False
            
        except Exception as e:
            _logger.exception("Status check failed for transaction %s: %s", self.reference, e)
            return False

    def _hdfc_upi_is_qr_expired(self):
        """Check if the QR code has expired.
        
        :return: True if expired, False otherwise
        :rtype: bool
        """
        self.ensure_one()
        
        if not self.hdfc_upi_qr_expiry:
            return True
        
        return self.hdfc_upi_qr_expiry <= fields.Datetime.now()

    @api.model
    def _get_tx_from_notification_data(self, provider_code, notification_data):
        """Override of payment to find the transaction based on HDFC UPI data.
        
        Note: self.ensure_one() from `_get_processing_values`
        
        :param str provider_code: The provider code
        :param dict notification_data: The notification data
        :return: The transaction if found
        :rtype: recordset of `payment.transaction`
        """
        tx = super()._get_tx_from_notification_data(provider_code, notification_data)
        if provider_code != 'hdfc_upi' or len(tx) == 1:
            return tx

        # Search by HDFC UPI order number
        order_no = notification_data.get('orderNo')
        if order_no:
            tx = self.search([
                ('provider_code', '=', 'hdfc_upi'),
                ('hdfc_upi_order_no', '=', order_no)
            ])
            if len(tx) == 1:
                return tx

        # Search by reference if order number not found
        reference = notification_data.get('reference')
        if reference:
            tx = self.search([
                ('provider_code', '=', 'hdfc_upi'),
                ('reference', '=', reference)
            ])

        if len(tx) != 1:
            _logger.warning(
                "Found %s transactions for HDFC UPI notification with data: %s",
                len(tx), notification_data
            )

        return tx

    def _process_notification_data(self, notification_data):
        """Handle notification data from HDFC UPI.
        
        Enhanced notification handling with better validation and state management.
        
        :param dict notification_data: The notification data received from HDFC UPI
        :return: None
        """
        super()._process_notification_data(notification_data)
        if self.provider_code != 'hdfc_upi':
            return

        _logger.info("Processing HDFC UPI notification for transaction: %s", self.reference)

        # Extract and validate notification data
        hdfc_status = notification_data.get('status', '')
        txn_id = notification_data.get('txnId', '')
        customer_ref = notification_data.get('customerRefNo', '')
        payer_vpa = notification_data.get('payerVPA', '')
        payer_name = notification_data.get('payerName', '')

        # Update transaction with HDFC UPI specific data
        update_vals = {}
        if txn_id:
            update_vals['hdfc_upi_txn_id'] = txn_id
        if customer_ref:
            update_vals['hdfc_upi_customer_ref_no'] = customer_ref
        if payer_vpa:
            update_vals['hdfc_upi_payer_vpa'] = payer_vpa
        if payer_name:
            update_vals['hdfc_upi_payer_name'] = payer_name

        if update_vals:
            self.write(update_vals)

        # Map HDFC status to Odoo state and process accordingly
        odoo_state = hdfc_upi_utils.map_hdfc_status_to_odoo_state(hdfc_status)
        if odoo_state:
            self._hdfc_upi_process_state_change(odoo_state, hdfc_status, notification_data)
        else:
            _logger.warning(
                "Unknown HDFC UPI status '%s' for transaction: %s",
                hdfc_status, self.reference
            )

    def _hdfc_upi_process_state_change(self, odoo_state, original_status, parsed_data):
        """Process transaction state change based on HDFC UPI status.
        
        :param str odoo_state: The mapped Odoo transaction state
        :param str original_status: The original HDFC UPI status
        :param dict parsed_data: The parsed notification data
        :return: None
        """
        self.ensure_one()
        
        _logger.info(
            "Processing state change for transaction %s: %s -> %s (HDFC status: %s)",
            self.reference, self.state, odoo_state, original_status
        )

        # Set provider reference from notification data
        provider_reference = parsed_data.get('txnId') or parsed_data.get('orderNo')
        if provider_reference and not self.provider_reference:
            self.provider_reference = provider_reference

        # Process state changes based on the new state
        # Get the response message from HDFC UPI callback
        response_message = parsed_data.get('response_message', original_status)
        
        if odoo_state == 'done':
            # Payment successful
            self._set_done()
            _logger.info("Transaction %s marked as done", self.reference)
            
        elif odoo_state == 'cancel':
            # Payment failed or cancelled
            self._set_canceled(state_message=response_message)
            _logger.info("Transaction %s marked as cancelled: %s", self.reference, response_message)
            
        elif odoo_state == 'pending':
            # Payment pending (rare for UPI, but possible)
            self._set_pending()
            _logger.info("Transaction %s marked as pending", self.reference)
            
        elif odoo_state == 'error':
            # Payment error
            error_message = parsed_data.get('response_message', 'Payment processing error')
            self._set_error(state_message=error_message)
            _logger.warning("Transaction %s marked as error: %s", self.reference, error_message)

        # Update last state change timestamp
        self.write({
            'last_state_change': fields.Datetime.now(),
            'state_message': response_message,
        })
