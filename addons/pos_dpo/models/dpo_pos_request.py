import logging
import json

from odoo import _
from odoo.exceptions import UserError

from requests import Session
from requests.exceptions import HTTPError, ConnectionError, Timeout, RequestException

_logger = logging.getLogger(__name__)
REQUEST_TIMEOUT = 10

ALLOWED_ENDPOINTS = {
    "START_TNX": "start-transaction",
    "CANCEL_TNX": "cancel-transaction",
    "GET_STATUS": "get-status",
    "GET_RESULT": "get-result",
}


class DPOPosRequest:
    def __init__(self, payment_method):
        self.session = Session()
        self.dpo_tid = payment_method.dpo_tid
        self.dpo_mid = payment_method.dpo_mid
        self.dpo_test_mode = payment_method.dpo_test_mode
        self.dpo_client_id = payment_method.dpo_client_id
        self.dpo_client_secret = payment_method.dpo_client_secret

        if not self.dpo_test_mode:
            raise UserError(_("Production mode not implemented yet."))

        if not self.dpo_tid or not self.dpo_mid:
            raise UserError(_("Device Serial Number (TID) and Merchant ID (MID) must be set."))

    def _get_base_url(self, is_token: bool = False) -> str:
        """Return the appropriate DPO base URL."""
        host = "api-dev.network.global" if self.dpo_test_mode else "api.network.global"
        if is_token:
            return f"https://{host}/v1"
        return f"https://{host}/ngenius-webapi/payments/push/v1/tid:{self.dpo_tid}/mid:{self.dpo_mid}"

    def generate_token(self) -> str:
        """Generate and return OAuth token from DPO."""
        url = f"{self._get_base_url(is_token=True)}/tokenkc/generate"
        payload = {
            'grant_type': 'client_credentials',
            'client_id': self.dpo_client_id,
            'client_secret': self.dpo_client_secret,
        }
        headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
        }

        try:
            _logger.info("Requesting new DPO token from %s", url)
            response = self.session.post(url, headers=headers, data=payload, timeout=REQUEST_TIMEOUT)
            response.raise_for_status()
            token = response.json().get("access_token")
            if not token:
                raise UserError(_("Access token not found in DPO response."))
            return token

        except RequestException as e:
            _logger.error("DPO token generation failed: %s", str(e))
            raise UserError(_("Access-token generation failed: {}").format(e))

    def call_network_pos_api(self, payload: dict, endpoint: str, token: str) -> dict:
        """Make POST request to DPO API using the provided token and endpoint."""
        if not token:
            _logger.warning("Missing token for endpoint '%s'", endpoint)
            return {'errorMessage': _("Missing token for DPO API call.")}

        endpoint_path = ALLOWED_ENDPOINTS.get(endpoint)
        if not endpoint_path:
            _logger.error("Invalid endpoint key: '%s'", endpoint)
            return {'errorMessage': _("Invalid API endpoint key.")}

        url = f"{self._get_base_url()}/{endpoint_path}"
        headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': f'Bearer {token}',
        }

        try:
            _logger.info("Calling DPO API endpoint '%s': %s", endpoint, url)
            response = self.session.post(url, headers=headers, json=payload, timeout=REQUEST_TIMEOUT)
            response.raise_for_status()
            return response.json()

        except HTTPError as error:
            return self._handle_http_error(error)
        except ConnectionError as error:
            _logger.warning("Connection error on %s: %r", url, error)
            return {'errorMessage': str(error)}
        except Timeout as error:
            _logger.warning("Timeout error on %s: %r", url, error)
            return {'errorMessage': str(error)}
        except json.decoder.JSONDecodeError as error:
            _logger.warning("JSON decode error on %s: %r", url, error)
            return {'errorMessage': _("Invalid JSON response received from DPO.")}

    def _handle_http_error(self, error: HTTPError) -> dict:
        """Extract and log message from HTTPError."""
        error_message = str(error)
        if error.response is not None:
            try:
                response_json = error.response.json()
                error_message = response_json.get('errorMessage') or error.response.text
            except ValueError:
                error_message = error.response.text
        _logger.warning("HTTPError from DPO: %s", error_message)
        return {'errorMessage': error_message}
