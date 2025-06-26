# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64
import logging
import pprint

from datetime import datetime, timedelta

from odoo import _, api, fields, models
from odoo.exceptions import UserError, ValidationError
from odoo.tools.image import image_data_uri

from odoo.addons.payment_hdfc_upi_qr import const
from odoo.addons.payment_hdfc_upi_qr import utils as hdfc_upi_utils

_logger = logging.getLogger(__name__)


class PaymentTransaction(models.Model):
    _inherit = 'payment.transaction'

    # HDFC UPI Fields
    hdfc_upi_order_no = fields.Char(string="Order Number", readonly=True)
    hdfc_upi_txn_id = fields.Char(string="Transaction ID", readonly=True)
    hdfc_upi_customer_ref_no = fields.Char(string="Customer Reference Number", readonly=True)
    hdfc_upi_qr_code = fields.Binary(string="UPI QR Code", attachment=True, readonly=True)
    hdfc_upi_qr_string = fields.Char(string="UPI QR String", readonly=True)
    hdfc_upi_qr_expiry = fields.Datetime(string="QR Code Expiry Time", readonly=True)
    hdfc_upi_payer_vpa = fields.Char(string="Payer VPA", readonly=True)
    hdfc_upi_payer_name = fields.Char(string="Payer Name", readonly=True)

    # Additional HDFC UPI Extra fields for comprehensive tracking
    hdfc_upi_response_code = fields.Char(string="Response Code", readonly=True)
    hdfc_upi_approval_number = fields.Char(string="Approval Number", readonly=True)
    hdfc_upi_reference_id = fields.Char(string="Reference ID", readonly=True)
    hdfc_upi_txn_date = fields.Char(string="Transaction Auth Date", readonly=True)
    hdfc_upi_payer_bank_name = fields.Char(string="Payer Bank Name", readonly=True)
    hdfc_upi_payer_account_number = fields.Char(string="Payer Account Number", readonly=True)
    hdfc_upi_payer_bank_ifsc = fields.Char(string="Payer Bank IFSC", readonly=True)
    hdfc_upi_payer_mobile = fields.Char(string="Payer Mobile", readonly=True)
    hdfc_upi_payer_account_type = fields.Char(string="Payer Account Type", readonly=True)
    hdfc_upi_payee_vpa = fields.Char(string="Payee VPA", readonly=True)
    hdfc_upi_txn_type = fields.Char(string="Transaction Type", readonly=True)
    hdfc_upi_txn_ref_url = fields.Char(string="Transaction Reference URL", readonly=True)

    # === ACTION METHODS === #

    def action_check_payment_status(self):
        """ Action to manually check payment status with HDFC UPI.

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
            message = _("Payment status check failed: %s", str(e))
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

    # === BUSINESS METHODS === #

    def _get_specific_processing_values(self, processing_values):
        """ Override of `payment` to return HDFC UPI-specific processing values.

        Note: self.ensure_one() from `_get_processing_values`

        :param dict processing_values: The generic processing values of the transaction
        :return: The dict of provider-specific processing values
        :rtype: dict
        :raise ValidationError: If QR code generation fails
        """
        res = super()._get_specific_processing_values(processing_values)
        if self.provider_code != 'hdfc_upi':
            return res

        # Validate transaction before processing
        self._hdfc_upi_validate_transaction()

        # Generate QR code for the transaction
        if not self.hdfc_upi_qr_code:
            try:
                self._hdfc_upi_generate_qr_code()
                _logger.info(
                    "Generated QR code for transaction with reference %s", self.reference
                )
            except Exception as e:
                _logger.exception("Failed to generate QR code for transaction %s", self.reference)
                raise ValidationError(_("HDFC UPI: Failed to generate QR code: %s", str(e)))

        # Calculate expiry time in seconds from now
        expiry_seconds = 0
        if self.hdfc_upi_qr_expiry:
            now = datetime.now()
            expiry_delta = self.hdfc_upi_qr_expiry - now
            expiry_seconds = max(0, int(expiry_delta.total_seconds()))

        # Convert QR code to data URI for frontend
        qr_code_data = image_data_uri(self.hdfc_upi_qr_code) if self.hdfc_upi_qr_code else None

        # Update processing values for frontend
        processing_values.update({
            'transaction_id': self.id,
            'merchant_name': self.provider_id.hdfc_upi_merchant_name or 'HDFC UPI',
            'currency_code': self.currency_id.name,
            'qr_code_data': qr_code_data,
            'expiry_seconds': expiry_seconds,
        })

        return processing_values

    def _send_refund_request(self, amount_to_refund=None):
        """ Override of `payment` to send a refund request to HDFC UPI.

        Note: self.ensure_one()

        :param float amount_to_refund: The amount to refund
        :return: The refund transaction created to process the refund request.
        :rtype: recordset of `payment.transaction`
        """
        refund_tx = super()._send_refund_request(amount_to_refund=amount_to_refund)
        if self.provider_code != 'hdfc_upi':
            return refund_tx

        # Prepare refund payload
        refund_payload = self._hdfc_upi_prepare_refund_payload(refund_tx)

        _logger.info(
            "Sending refund request for transaction with reference %s:\n%s",
            self.reference, pprint.pformat(refund_payload)
        )

        try:
            # Make refund request to HDFC UPI API
            response_data = refund_tx.provider_id._hdfc_upi_make_request('refund', refund_payload)

            _logger.info(
                "Refund request response for transaction with reference %s:\n%s",
                self.reference, pprint.pformat(response_data)
            )

            # Process refund response
            self._hdfc_upi_process_refund_response(refund_tx, response_data)

        except Exception as e:
            _logger.exception("Refund request failed for transaction %s", self.reference)
            refund_tx._set_error(
                "HDFC UPI: " + _("Refund request failed: %s", str(e))
            )

        return refund_tx

    @api.model
    def _get_tx_from_notification_data(self, provider_code, notification_data):
        """ Override of `payment` to find the transaction based on HDFC UPI data.

        :param str provider_code: The code of the provider that handled the transaction
        :param dict notification_data: The notification data sent by the provider
        :return: The transaction if found
        :rtype: recordset of `payment.transaction`
        :raise ValidationError: If the data match no transaction
        """
        tx = super()._get_tx_from_notification_data(provider_code, notification_data)
        if provider_code != 'hdfc_upi' or len(tx) == 1:
            return tx

        order_no = notification_data.get('orderNo')
        if order_no:
            tx = self.search([
                ('provider_code', '=', 'hdfc_upi'),
                ('hdfc_upi_order_no', '=', order_no)
            ])

        if not tx:
            raise ValidationError(
                "HDFC UPI: " + _("No transaction found matching order number %s.", order_no)
            )

        return tx

    def _process_notification_data(self, notification_data):
        """ Override of `payment` to process the transaction based on HDFC UPI data.

        Note: self.ensure_one()

        :param dict notification_data: The notification data sent by the provider
        :return: None
        :raise ValidationError: If inconsistent data were received.
        """
        super()._process_notification_data(notification_data)
        if self.provider_code != 'hdfc_upi':
            return

        _logger.info(
            "Processing HDFC UPI notification for transaction with reference %s:\n%s",
            self.reference, pprint.pformat(notification_data)
        )

        # Extract and validate notification data according to HDFC UPI specification
        hdfc_status = notification_data.get('status')
        txn_id = notification_data.get('upiTxnId')
        customer_ref = notification_data.get('customerRefNo')
        payer_vpa = notification_data.get('payerVPA')
        payer_name = notification_data.get('payerName')

        # Additional fields from HDFC UPI callback (21 fields total)
        response_code = notification_data.get('responseCode')
        approval_number = notification_data.get('approvalNumber')
        reference_id = notification_data.get('referenceId')
        txn_date = notification_data.get('txnAuthDate')
        response_message = notification_data.get('statusDesc')

        # Payer bank details (from Additional Field 6)
        payer_bank_name = notification_data.get('payerBankName')
        payer_account_number = notification_data.get('payerAccountNumber')
        payer_bank_ifsc = notification_data.get('payerBankIFSC')
        payer_mobile = notification_data.get('payerMobile')

        # Transaction details (from Additional Field 7)
        txn_type = notification_data.get('txnType')
        txn_ref_url = notification_data.get('txnRefUrl')

        # Payee and account details (from Additional Fields 8 & 9)
        payee_vpa = notification_data.get('payeeVPA')
        payer_account_type = notification_data.get('payerAccountType')

        # Update transaction with HDFC UPI specific data
        update_vals = {}

        # Core transaction fields
        if txn_id and (not self.hdfc_upi_txn_id or self.state not in ('done', 'cancel')):
            update_vals.update({
                'hdfc_upi_txn_id': txn_id,
                'provider_reference': txn_id,
            })
        if customer_ref:
            update_vals['hdfc_upi_customer_ref_no'] = customer_ref
        if payer_vpa:
            update_vals['hdfc_upi_payer_vpa'] = payer_vpa
        if payer_name:
            update_vals['hdfc_upi_payer_name'] = payer_name

        # Additional callback fields
        if response_code:
            update_vals['hdfc_upi_response_code'] = response_code
        if approval_number:
            update_vals['hdfc_upi_approval_number'] = approval_number
        if reference_id:
            update_vals['hdfc_upi_reference_id'] = reference_id
        if txn_date:
            update_vals['hdfc_upi_txn_date'] = txn_date

        # Payer bank information
        if payer_bank_name:
            update_vals['hdfc_upi_payer_bank_name'] = payer_bank_name
        if payer_account_number:
            update_vals['hdfc_upi_payer_account_number'] = payer_account_number
        if payer_bank_ifsc:
            update_vals['hdfc_upi_payer_bank_ifsc'] = payer_bank_ifsc
        if payer_mobile:
            update_vals['hdfc_upi_payer_mobile'] = payer_mobile
        if payer_account_type:
            update_vals['hdfc_upi_payer_account_type'] = payer_account_type

        # Transaction details
        if txn_type:
            update_vals['hdfc_upi_txn_type'] = txn_type
        if txn_ref_url:
            update_vals['hdfc_upi_txn_ref_url'] = txn_ref_url
        if payee_vpa:
            update_vals['hdfc_upi_payee_vpa'] = payee_vpa

        if update_vals:
            self.write(update_vals)

        # Update the payment state
        if not hdfc_status:
            raise ValidationError("HDFC UPI: " + _("Received data with missing status."))

        # Map HDFC status to transaction state and process accordingly
        if hdfc_status in const.PAYMENT_STATUS_MAPPING['done']:
            self._set_done()
            _logger.info(
                "Transaction with reference %s confirmed. Status: %s, TXN ID: %s",
                self.reference, hdfc_status, txn_id
            )
        elif hdfc_status in const.PAYMENT_STATUS_MAPPING['pending']:
            self._set_pending()
            _logger.info(
                "Transaction with reference %s is pending. Status: %s",
                self.reference, hdfc_status
            )
        elif hdfc_status in const.PAYMENT_STATUS_MAPPING['cancel']:
            cancel_message = response_message or 'Payment was cancelled'
            _logger.info(
                "Transaction with reference %s was cancelled. Status: %s, Response Code: %s, Reason: %s",
                self.reference, hdfc_status, response_code, cancel_message
            )
            self._set_canceled(
                "HDFC UPI: " + _("Payment was cancelled: %s", cancel_message)
            )
        elif hdfc_status in const.PAYMENT_STATUS_MAPPING['error']:
            error_message = response_message or 'Payment processing failed'
            _logger.warning(
                "Transaction with reference %s underwent an error. Status: %s, Response Code: %s, Reason: %s",
                self.reference, hdfc_status, response_code, error_message
            )
            self._set_error(
                "HDFC UPI: " + _("An error occurred during payment processing: %s", error_message)
            )
        else:  # Classify unsupported payment status as the `error` tx state
            _logger.warning(
                "Received data for transaction with reference %s with invalid payment status: %s, response code: %s",
                self.reference, hdfc_status, response_code
            )
            self._set_error(
                "HDFC UPI: " + _("Received data with invalid status: %s", hdfc_status)
            )

    def _hdfc_upi_validate_transaction(self):
        """ Validate transaction parameters for HDFC UPI processing.

        :return: None
        :raise ValidationError: If validation fails
        """
        self.ensure_one()

        # Amount validation using utility function
        is_valid, error_message = hdfc_upi_utils.validate_transaction_amount(
            self.amount, self.currency_id.name
        )
        if not is_valid:
            raise ValidationError(_("HDFC UPI: %s", error_message))

        # Provider configuration validation
        if not self.provider_id.hdfc_upi_merchant_id:
            raise ValidationError(_("HDFC UPI: Merchant ID is not configured"))

        if not self.provider_id.company_id.l10n_in_upi_id:
            raise ValidationError(_("HDFC UPI: Company UPI VPA is not configured"))

        # Validate UPI VPA format
        merchant_vpa = self.provider_id.company_id.l10n_in_upi_id
        if not hdfc_upi_utils.validate_upi_vpa(merchant_vpa):
            raise ValidationError(_("HDFC UPI: Invalid UPI VPA format: %s", merchant_vpa))

    def _hdfc_upi_generate_qr_code(self):
        """ Generate a UPI QR code for the transaction.

        Creates a QR code containing UPI payment information following HDFC Bank
        specifications.

        :return: None
        :raise ValidationError: If QR code generation fails
        """
        self.ensure_one()

        # Generate unique order number using utility function
        if not self.hdfc_upi_order_no:
            self.hdfc_upi_order_no = hdfc_upi_utils.generate_transaction_reference('PQ')

        # Build UPI URL using utility function
        upi_url = hdfc_upi_utils.build_upi_url(
            transaction_ref=self.hdfc_upi_order_no,
            amount=self.amount,
            payee_name=self.provider_id.hdfc_upi_merchant_name or self.company_id.name,
            payee_vpa=self.provider_id.company_id.l10n_in_upi_id,
            merchant_category=self.provider_id.hdfc_upi_merchant_category or '0000'
        )

        # Set QR expiry time
        expiry_minutes = const.QR_CODE_CONFIG['expiry_minutes']
        self.hdfc_upi_qr_expiry = fields.Datetime.now() + timedelta(minutes=expiry_minutes)

        # Store UPI URL for QR generation
        self.hdfc_upi_qr_string = upi_url

        # Generate QR code using ir.actions.report barcode method
        barcode = self.env['ir.actions.report'].sudo().barcode(
            barcode_type="QR",
            value=upi_url,
            width=300,
            height=300
        )

        # Validate barcode generation result
        if not barcode:
            raise ValidationError(_("HDFC UPI: Barcode generation returned empty data"))

        # Store the QR code as base64
        self.hdfc_upi_qr_code = base64.b64encode(barcode)

        _logger.info(
            "Generated UPI QR code for transaction %s with amount ₹%s",
            self.reference, self.amount
        )

    def _hdfc_upi_prepare_refund_payload(self, refund_tx):
        """ Prepare refund request payload for HDFC UPI API.

        Creates the 20-field refund request according to HDFC UPI specification.

        :param recordset refund_tx: The refund transaction
        :return: The refund request payload
        :rtype: dict
        :raise ValidationError: If required fields are missing or encryption key is not configured
        """
        self.ensure_one()

        # Generate refund reference
        refund_reference = hdfc_upi_utils.generate_refund_reference(self.reference)
        refund_tx.hdfc_upi_order_no = refund_reference

        # Prepare 20-field request according to HDFC Refund API specification
        request_fields = {
            'pgMerchantId': self.provider_id.hdfc_upi_merchant_id,
            'newOrderNo': refund_reference,
            'originalOrderNo': self.hdfc_upi_order_no,
            'originalTrnRefNo': self.hdfc_upi_txn_id or self.provider_reference,
            'originalCustRefNo': self.hdfc_upi_customer_ref_no,
            'remarks': 'Customer Request',
            'refundAmount': -refund_tx.amount,  # The amount is negative for refund transactions
            'currency': 'INR',
            'paymentType': 'P2P',
            'transactionType': 'PAY',
            'additionalField1': 'NA',
            'additionalField2': 'NA',
            'additionalField3': 'NA',
            'additionalField4': 'NA',
            'additionalField5': 'NA',
            'additionalField6': 'NA',
            'additionalField7': 'NA',
            'additionalField8': 'NA',
            'additionalField9': 'NA',  # Expected: NA
            'additionalField10': 'NA',  # Expected: NA
        }

        # Validate required fields
        for field_name, field_value in request_fields.items():
            if field_name in ['pgMerchantId', 'newOrderNo', 'originalOrderNo', 'originalCustRefNo', 'refundAmount', 'currency']:
                if not field_value or field_value == 'NA':
                    raise ValidationError(
                        _("HDFC UPI Refund: Required field '%s' is missing or invalid", field_name)
                    )

        # Build pipe-separated request string
        request_string = hdfc_upi_utils.build_pipe_separated_request(
            request_fields, const.REFUND_REQUEST_FIELDS
        )

        _logger.info(
            "HDFC UPI Refund: Built 20-field request for transaction %s",
            self.reference
        )

        # Build encrypted payload - encryption key is required
        if not self.provider_id.hdfc_upi_encryption_key:
            raise ValidationError(_("HDFC UPI Refund: Encryption key is required but not configured"))

        payload = hdfc_upi_utils.build_encrypted_request_payload(
            request_string,
            self.provider_id.hdfc_upi_merchant_id,
            self.provider_id.hdfc_upi_encryption_key
        )

        _logger.info(
            "Prepared refund payload for transaction with reference %s",
            self.reference
        )

        return payload

    def _hdfc_upi_process_refund_response(self, refund_tx, response_data):
        """ Process refund response from HDFC UPI API.

        Uses the consolidated parsing method to handle the 21-field response format.

        :param recordset refund_tx: The refund transaction
        :param dict response_data: The API response data
        :return: None
        :raise ValidationError: If response is empty, invalid format, or encryption key is missing
        """
        self.ensure_one()

        if not response_data:
            raise ValidationError(_("HDFC UPI: Empty response received from refund API"))

        _logger.info(
            "Processing refund response for transaction with reference %s:\n%s",
            self.reference, pprint.pformat(response_data)
        )

        # Validate response format first
        if not response_data or not isinstance(response_data, str):
            raise ValidationError(_("HDFC UPI Refund: Invalid response format received"))

        # Check if encryption is enabled
        if not self.provider_id.hdfc_upi_encryption_key:
            raise ValidationError(_("HDFC UPI Refund: Encrypted response received but no encryption key configured"))

        try:
            # Decrypt the plain text response
            decrypted_response = hdfc_upi_utils.decrypt_payload(
                response_data,
                self.provider_id.hdfc_upi_encryption_key
            )

            # Parse the decrypted pipe-separated response
            parsed_response = refund_tx._parse_hdfc_notification_fields(
                decrypted_response, 'refund'
            )

            # Check for error codes
            response_code = parsed_response.get('responseCode', '')
            if response_code in const.REFUND_ERROR_CODES:
                error_message = const.REFUND_ERROR_CODES[response_code]
                _logger.error(
                    "Refund request failed for transaction %s: %s (%s)",
                    self.reference, error_message, response_code
                )
                refund_tx._set_error(f"HDFC UPI: {error_message}")
                return

            # Process successful response
            refund_status = parsed_response.get('status', '').upper()
            refund_txn_id = parsed_response.get('upiTxnId')

            # Update refund transaction with response data
            update_vals = {
                'provider_reference': refund_txn_id or parsed_response.get('referenceId'),
                'hdfc_upi_txn_id': refund_txn_id,
                'hdfc_upi_response_code': response_code,
                'hdfc_upi_reference_id': parsed_response.get('referenceId'),
            }

            # Update customer reference if available
            if parsed_response.get('customerRefNo'):
                update_vals['hdfc_upi_customer_ref_no'] = parsed_response.get('customerRefNo')

            # Update transaction data first
            if update_vals:
                refund_tx.write(update_vals)

            # Set transaction state based on status using the same mapping as notification processing
            if not refund_status:
                refund_tx._set_error("HDFC UPI: " + _("Received refund response with missing status"))
                return

            # Map HDFC status to transaction state and process accordingly
            if refund_status in const.PAYMENT_STATUS_MAPPING['done']:
                refund_tx._set_done()
                # Immediately post-process the transaction as the post-processing will not be
                # triggered by a customer browsing the transaction from the portal.
                self.env.ref('payment.cron_post_process_payment_tx')._trigger()
                _logger.info(
                    "Refund completed successfully for transaction: %s, Status: %s, TXN ID: %s",
                    self.reference, refund_status, refund_txn_id
                )
            elif refund_status in const.PAYMENT_STATUS_MAPPING['pending']:
                refund_tx._set_pending()
                _logger.info(
                    "Refund is being processed for transaction: %s, Status: %s",
                    self.reference, refund_status
                )
            elif refund_status in const.PAYMENT_STATUS_MAPPING['cancel']:
                cancel_message = parsed_response.get('statusDesc', 'Refund was cancelled')
                refund_tx._set_canceled(
                    "HDFC UPI: " + _("Refund was cancelled: %s", cancel_message)
                )
                _logger.info(
                    "Refund was cancelled for transaction: %s, Status: %s, Response Code: %s, Reason: %s",
                    self.reference, refund_status, response_code, cancel_message
                )
            elif refund_status in const.PAYMENT_STATUS_MAPPING['error']:
                error_message = parsed_response.get('statusDesc', 'Refund processing failed')
                refund_tx._set_error(
                    "HDFC UPI: " + _("An error occurred during refund processing: %s", error_message)
                )
                _logger.warning(
                    "Refund underwent an error for transaction: %s, Status: %s, Response Code: %s, Reason: %s",
                    self.reference, refund_status, response_code, error_message
                )
            else:  # Classify unsupported refund status as the `error` tx state
                _logger.warning(
                    "Received refund response for transaction: %s with invalid status: %s, response code: %s",
                    self.reference, refund_status, response_code
                )
                refund_tx._set_error(
                    "HDFC UPI: " + _("Received refund response with invalid status: %s", refund_status)
                )

        except Exception as e:
            _logger.exception("Error processing refund response for transaction %s", self.reference)
            refund_tx._set_error(f"HDFC UPI: Refund processing failed: {e!s}")

    def _hdfc_upi_check_payment_status(self):
        """Check payment status using HDFC UPI Transaction Status Enquiry API.

        Enhanced status checking with comprehensive HDFC UPI specification compliance.
        Implements 14-field request format and processes 21-field response format.

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
            # Prepare 14-field request according to HDFC Status Enquiry API specification
            request_fields = {
                'pgMerchantId': self.provider_id.hdfc_upi_merchant_id,
                'orderNo': self.hdfc_upi_order_no,
                'upiTxnId': self.hdfc_upi_txn_id,
                'rrn': self.hdfc_upi_customer_ref_no,
                'additionalField1': 'NA',
                'additionalField2': 'NA',
                'additionalField3': 'NA',
                'additionalField4': 'NA',
                'additionalField5': 'NA',
                'additionalField6': 'NA',
                'additionalField7': 'NA',
                'additionalField8': 'NA',
                'additionalField9': 'NA',  # Expected: NA
                'additionalField10': 'NA',  # Expected: NA
            }

            # Build pipe-separated request string
            request_string = hdfc_upi_utils.build_pipe_separated_request(
                request_fields, const.STATUS_ENQUIRY_REQUEST_FIELDS
            )

            _logger.info(
                "HDFC UPI Status Enquiry: Built 14-field request for transaction %s",
                self.reference
            )

            # Build encrypted payload - encryption key is required
            if not self.provider_id.hdfc_upi_encryption_key:
                _logger.error("HDFC UPI Status Enquiry: Encryption key is required but not configured")
                return False

            payload = hdfc_upi_utils.build_encrypted_request_payload(
                request_string,
                self.provider_id.hdfc_upi_merchant_id,
                self.provider_id.hdfc_upi_encryption_key
            )

            # Make API request to status endpoint
            response_data = self.provider_id._hdfc_upi_make_request('status', payload)

            # Process encrypted response - HDFC always returns plain text (encrypted)
            if response_data:
                # Decrypt the plain text response
                decrypted_response = hdfc_upi_utils.decrypt_payload(
                    response_data,
                    self.provider_id.hdfc_upi_encryption_key
                )

                # Parse the decrypted pipe-separated response
                parsed_data = self._parse_hdfc_notification_fields(
                    decrypted_response, 'status_enquiry'
                )

                # Check for error codes
                response_code = parsed_data.get('responseCode', '')
                if response_code in const.STATUS_ENQUIRY_ERROR_CODES:
                    error_message = const.STATUS_ENQUIRY_ERROR_CODES[response_code]
                    _logger.warning(
                        "Status enquiry returned error for transaction %s: %s (%s)",
                        self.reference, error_message, response_code
                    )
                    return False

                # Process successful response
                if parsed_data.get('status'):
                    self._process_notification_data(parsed_data)
                    _logger.info(
                        "Status enquiry successful for transaction %s: %s",
                        self.reference, parsed_data.get('status')
                    )
                    return True

            _logger.warning("Invalid status response for transaction: %s", self.reference)
            return False

        except Exception:
            _logger.exception("Status check failed for transaction %s", self.reference)
            return False

    # === CONSOLIDATED NOTIFICATION PARSING === #

    def _parse_hdfc_notification_fields(self, fields_data, api_type='callback'):
        """Parse pipe-separated fields from HDFC UPI API responses.

        This consolidated method handles field parsing for all three HDFC UPI APIs:
        - Callback API (21 fields)
        - Transaction Status Enquiry API (21 fields)
        - Refund API (21 fields)

        All APIs use the same 21-field response format according to HDFC specifications.

        :param list/str fields_data: Pipe-separated response data or list of fields
        :param str api_type: Type of API ('callback', 'status_enquiry', 'refund')
        :return: Dictionary of parsed notification data
        :rtype: dict
        :raise ValidationError: If field parsing fails
        """
        self.ensure_one()

        # Convert string to list if needed
        if isinstance(fields_data, str):
            fields_list = fields_data.split('|')
        elif isinstance(fields_data, list):
            fields_list = fields_data
        else:
            raise ValidationError(_("HDFC UPI: Invalid fields data format for parsing"))

        # Validate minimum field count
        if len(fields_list) < 21:
            _logger.warning(
                "HDFC UPI %s: Invalid field count - expected 21 fields, got %d",
                api_type.upper(), len(fields_list)
            )

        # Use the RESPONSE_FIELDS constant for consistent field mapping
        field_names = const.RESPONSE_FIELDS

        # Parse using utility function
        parsed_data = hdfc_upi_utils.parse_pipe_separated_response(
            '|'.join(fields_list), field_names
        )

        # Parse structured additional fields according to HDFC specifications
        self._parse_hdfc_additional_fields(parsed_data)

        _logger.info(
            "HDFC UPI %s: Successfully parsed %d fields for transaction %s",
            api_type.upper(), len(fields_list), self.reference
        )

        return parsed_data

    def _parse_hdfc_additional_fields(self, parsed_data):
        """Parse structured additional fields from HDFC UPI response.

        Handles the parsing of Additional Fields 6-10 which contain structured
        data separated by exclamation marks according to HDFC specifications.

        :param dict parsed_data: Dictionary of parsed data to update
        :return: None (modifies parsed_data in place)
        """
        # Additional Field 6 (Index 16): Payer Bank Details
        # Format: "Payer Bank Name!Payer Account Number!Payer Bank IFSC!Payer Mobile Number"
        if parsed_data.get('additionalField6'):
            payer_bank_parts = hdfc_upi_utils.parse_additional_field_details(
                parsed_data['additionalField6'], 4
            )
            parsed_data.update({
                'payerBankName': payer_bank_parts[0],
                'payerAccountNumber': payer_bank_parts[1],
                'payerBankIFSC': payer_bank_parts[2],
                'payerMobile': payer_bank_parts[3],
            })

        # Additional Field 7 (Index 17): Transaction Details
        # Format: "Txn Type!Txn Ref Url!NA!Txn Id!NA"
        if parsed_data.get('additionalField7'):
            txn_details_parts = hdfc_upi_utils.parse_additional_field_details(
                parsed_data['additionalField7'], 5
            )
            parsed_data.update({
                'txnType': txn_details_parts[0],
                'txnRefUrl': txn_details_parts[1],
                'txnIdAdditional': txn_details_parts[3],
            })

        # Additional Field 8 (Index 18): Payee VPA Details
        # Format: "Payee VPA!NA!NA"
        if parsed_data.get('additionalField8'):
            payee_details_parts = hdfc_upi_utils.parse_additional_field_details(
                parsed_data['additionalField8'], 3
            )
            parsed_data.update({
                'payeeVPA': payee_details_parts[0],
            })

        # Additional Field 9 (Index 19): Payer Account Type
        # Format: "Payer Acc Type!NA!NA!NA!NA"
        if parsed_data.get('additionalField9'):
            payer_acc_parts = hdfc_upi_utils.parse_additional_field_details(
                parsed_data['additionalField9'], 5
            )
            parsed_data.update({
                'payerAccountType': payer_acc_parts[0],
            })

        # Additional Field 10 (Index 20): Payer Name
        # Format: "Payer Name!NA!NA!NA!NA"
        if parsed_data.get('additionalField10'):
            payer_name_parts = hdfc_upi_utils.parse_additional_field_details(
                parsed_data['additionalField10'], 5
            )
            parsed_data.update({
                'payerName': payer_name_parts[0],
            })
