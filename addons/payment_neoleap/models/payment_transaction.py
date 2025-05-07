# Part of Odoo. See LICENSE file for full copyright and licensing details.

import requests
import logging
import json
import urllib.parse
from base64 import b16decode
from werkzeug import urls
from werkzeug.urls import url_encode

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

from odoo import _, models
from odoo.exceptions import UserError, ValidationError

from odoo.addons.payment_neoleap import const
from odoo.addons.payment import utils as payment_utils


_logger = logging.getLogger(__name__)


class PaymentTransaction(models.Model):
    _inherit = 'payment.transaction'

    def _call_transaction_status_api(self, data):
        demo_data = [{
            "id": self.provider_id.neoleap_tranportal_id,
            "password": self.provider_id.neoleap_password,
            "action": "8",
            "amt": data.get('amt'),
            "currencyCode": "682",
            "trackId": self.reference,
            "udf5": "PaymentID",
            "transId": self.provider_reference
        }]
        # breakpoint()
        encrypted_trandata = self.provider_id._encrypt_trandata(demo_data)

        end_point = 'https://securepayments.alrajhibank.com.sa/pg/payment/tranportal.htm'
        time_out = 40
        payload = [{
            "id": self.provider_id.neoleap_tranportal_id,
            "trandata": encrypted_trandata
        }]
        customer_ip = payment_utils.get_customer_ip_address()
        response = requests.post(
            url=end_point,
            json=payload,
            timeout=time_out,
            headers={'Content-type': 'application/json', 'X-FORWARDED-FOR': customer_ip},
        )
        trandata_encrypted = response.json()[0].get('trandata')
        if response.status_code == 200:
            try:
                decrypted_data = self._decrypt_trandata(trandata_encrypted, self.provider_id.neoleap_resource_key)
                return decrypted_data[0]
            except Exception:
                _logger.warning("NeoLeap: Failed to parse transaction status response.")
        return {}

    def _get_specific_rendering_values(self, processing_values):
        # breakpoint()
        res = super()._get_specific_rendering_values(processing_values)
        if self.provider_code != 'neoleap':
            return res

        base_url = self.provider_id.get_base_url()
        trandata = [{
            "amt": str(self.amount),
            "action": "1",
            "password": self.provider_id.neoleap_password,
            "id": self.provider_id.neoleap_tranportal_id,
            "currencyCode": "682",
            "trackId": self.reference,
            "responseURL": urls.url_join(base_url, 'payment/neoleap/return'),
            "errorURL": urls.url_join(base_url, 'payment/neoleap/error'),
        }]
        encrypted_trandata = self.provider_id._encrypt_trandata(trandata)
        payload = [{
            'id': self.provider_id.neoleap_tranportal_id,
            'trandata': encrypted_trandata,
            'responseURL': trandata[0]['responseURL'],
            'errorURL': trandata[0]['errorURL'],
        }]
        if self.provider_id.state == 'test':
            end_point = "https://securepayments.alrajhibank.com.sa/pg/payment/hosted.htm" 
        elif self.provider_id.state == 'enabled':
            end_point = "https://securepayments.alrajhibank.com.sa/pg/payment/hosted.htm" # need to change with actual URL for live transactions
        time_out = 40
        # breakpoint()
        response = self._send_post_request(end_point, payload, time_out)
        try:
            result = response.json()
            if result[0].get('result'):
                payment_id = result[0]['result'].split(":")[0]
                self.provider_reference = payment_id
            else:
                error_text = result[0].get('errorText', '')
                message = error_text.split("-")[2] if "-" in error_text else error_text or "Unknown error"
                _logger.error("NeoLeap: Payment gateway returned errorText: %s", error_text)
                raise UserError(_("Payment gateway error: %s") % message)
        except (UserError, ValidationError):
            _logger.exception("NeoLeap: Error while processing the response data.")
            raise
        except Exception:
            try:
                error_text = response.json()[0].get('errorText', '')
                message = error_text.split("-")[2] if "-" in error_text else error_text
                _logger.error("NeoLeap: Unexpected error during payment. errorText: %s", error_text)
                raise UserError(_("An error occurred during payment processing: %s") % message)
            except Exception:
                _logger.exception("NeoLeap: Unexpected error occurred while handling response.")
                raise UserError(_("An unexpected error occurred during payment processing."))

        checkout_url = 'https://securepayments.alrajhibank.com.sa/pg/paymentpage.htm'
        url_params = {'PaymentID': payment_id}

        return {'api_url': checkout_url, 'url_params': url_params}

    def _get_specific_processing_values(self, processing_values):
        if self.provider_code != 'neoleap':
            return super()._get_specific_processing_values(processing_values)
        return {}

    def _send_refund_request(self, amount_to_refund=None):
        refund_tx = super()._send_refund_request(amount_to_refund=amount_to_refund)
        if self.provider_code != 'neoleap':
            return refund_tx

        try:
            trandata = [{
                "id": refund_tx.provider_id.neoleap_tranportal_id,
                "password": refund_tx.provider_id.neoleap_password,
                "action": "2",
                "amt": str(self.amount),
                "currencyCode": "682",
                "trackId": refund_tx.reference,
                "udf5": "PaymentID",
                "transId": self.provider_reference
            }]
            encrypted_trandata = self.provider_id._encrypt_trandata(trandata)
            payload = [{
                'id': self.provider_id.neoleap_tranportal_id,
                'trandata': encrypted_trandata
            }]
            end_point = "https://securepayments.alrajhibank.com.sa/pg/payment/tranportal.htm"
            time_out = 40
            response = self._send_post_request(end_point, payload, time_out)
            trandata_encrypted = response.json()[0].get('trandata')
            decrypted_data = self._decrypt_trandata(trandata_encrypted, self.provider_id.neoleap_resource_key)
            refund_tx._handle_notification_data('neoleap', decrypted_data)
        except Exception as e:
            _logger.exception("NeoLeap: Error occurred while sending refund request for reference '%s'.", self.reference)
            raise UserError("An unexpected error occurred during the refund process.") from e
        return refund_tx

    def _handle_notification_data(self, provider_code, data):
        super()._handle_notification_data(provider_code, data)
        # breakpoint()
        if provider_code != 'neoleap':
            return

        try:
            transaction_id = data[0].get('transId')
            if not transaction_id:
                raise ValidationError("Neoleap: " + _("Received data with missing transaction id"))
            tx_status = self._call_transaction_status_api(data[0])
            result = tx_status.get('result')
            if result in const.PAYMENT_STATUS_MAPPING['done']:
                self._set_done()
                # Immediately post-process the transaction if it is a refund, as the post-processing
                # will not be triggered by a customer browsing the transaction from the portal.
                if self.operation == 'refund':
                    self.env.ref('payment.cron_post_process_payment_tx')._trigger()
            elif result in const.PAYMENT_STATUS_MAPPING['pending']:
                self._set_canceled(_('Payment was not captured.'))
            else:
                _logger.warning(
                    "NeoLeap: Received data with invalid payment status for transaction with reference %s. Result: %s",
                    self.reference, result
                )
                self._set_error(_('Unexpected result from NeoLeap: %s') % result)
        except ValidationError as e:
            _logger.error("NeoLeap: Validation error while handling notification for reference '%s'. Error: %s", self.reference, str(e))
            raise e
        except Exception as e:
            _logger.exception("NeoLeap: Unexpected error while processing notification data for transaction reference '%s'.", self.reference)
            self._set_error(_('An unexpected error occurred while processing the payment notification.'))
            raise

    def _send_post_request(self, end_point, payload, time_out):
        # breakpoint()
        customer_ip = payment_utils.get_customer_ip_address()
        response = requests.post(
            url=end_point,
            json=payload,
            timeout=time_out,
            headers={'Content-type': 'application/json', 'X-FORWARDED-FOR': customer_ip}
        )
        return response

    def _create_child_transaction(self, amount, is_refund=False, **custom_create_values):
        child_transaction = super()._create_child_transaction(amount, is_refund, **custom_create_values)
        child_transaction.provider_reference = self.provider_reference
        return child_transaction

    def _decrypt_trandata(self, encrypted_trandata, resource_key):
        key = resource_key.encode('utf-8')
        iv = b'PGKEYENCDECIVSPC'
        try:
            hex_string = urllib.parse.unquote(encrypted_trandata)
            hex_string = ''.join(c for c in hex_string if c.lower() in '0123456789abcdef')
            if len(hex_string) % 2 != 0:
                raise ValueError("Hex string has odd length")
            encrypted_bytes = bytes.fromhex(hex_string)

            cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
            decryptor = cipher.decryptor()
            decrypted = decryptor.update(encrypted_bytes) + decryptor.finalize()

            pad = decrypted[-1]
            if pad < 1 or pad > 16:
                raise ValueError("Invalid padding byte.")
            decrypted = decrypted[:-pad]
            decrypted_str = decrypted.decode('utf-8', errors='ignore')

            if '%' in decrypted_str:
                decrypted_str = urllib.parse.unquote(decrypted_str)

            decrypted_str = decrypted_str.strip('\x00')
            return json.loads(decrypted_str)

        except (ValueError, json.JSONDecodeError) as e:
            _logger.error("NeoLeap: Decryption or JSON parsing failed: %s", str(e))
            raise
        except Exception as e:
            _logger.exception("NeoLeap: Unexpected error in _decrypt_trandata.")
            raise
