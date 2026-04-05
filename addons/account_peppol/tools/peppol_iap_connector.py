import logging
import requests

from odoo.exceptions import UserError
from odoo.tools.urls import urljoin

from odoo.addons.account_peppol.exceptions import get_peppol_error_message

_logger = logging.getLogger(__name__)

CONNECT_TIMEOUT = 5
READ_TIMEOUT = 20
DEFAULT_TIMEOUT = 10
PEPPOL_PROXY_URLS = {
    'prod': 'https://peppol.api.odoo.com',
    'test': 'https://peppol.test.odoo.com',
    'demo': 'handle_case_by_case'
}
MOCKED_ANSWERS = {
}


class PeppolIAPConnector:

    def __init__(self, company):
        assert company.exists()
        self.company = company
        self.env = company.env
        proxy_mode = company._get_peppol_edi_mode()
        self.proxy_mode = proxy_mode
        self.base_url = PEPPOL_PROXY_URLS[proxy_mode]

    def request_public_http(self, method, endpoint, data=None, params=None):
        headers = {'Content-Type': 'application/json'}
        url = urljoin(self.base_url, endpoint)
        response_vals = {}
        try:
            response = requests.request(method, url, json=data, params=params, timeout=DEFAULT_TIMEOUT, headers=headers)
            response_vals = response.json()
            response.raise_for_status()
        except requests.exceptions.RequestException as e:
            if response_vals and 'code' in response_vals:
                raise UserError(get_peppol_error_message(self.env, response_vals))
            _logger.debug("Failed to connect to Odoo Peppol Proxy %s, %s, %s", endpoint, data or params, e)
            raise UserError(self.env._("Failed to connect to Odoo Peppol Proxy."))
        except ValueError as ve:
            _logger.debug("Odoo Peppol Proxy returned an invalid response %s, %s, %s", endpoint, data or params, ve)
            raise UserError(self.env._("Odoo Peppol Proxy returned an invalid response."))
        return response_vals

    def can_connect(self, *, peppol_identifier, db_uuid, callback_url, connect_token):
        assert self.proxy_mode != 'demo'
        params = {'dbuuid': db_uuid, 'peppol_identifier': peppol_identifier, 'callback_url': callback_url, 'connect_token': connect_token}
        return self.request_public_http('GET', '/api/peppol/2/can_connect', params=params)

    def create_connection(self, *, peppol_identifier, db_uuid, public_key, auth_token=None, **company_details):
        assert self.proxy_mode != 'demo'
        params = {
            'peppol_identifier': peppol_identifier,
            'dbuuid': db_uuid,
            'company_id': self.company.id,
            'public_key': public_key,
            'auth_token': auth_token,
            **company_details
        }
        response = self.request_public_http('POST', '/api/peppol/2/connect', data=params)
        return response

    def lookup(self, peppol_identifier):
        """NAPTR DNS peppol participant lookup through Odoo's Peppol proxy.
        Example of succesful lookup:
        {
            'identifier': '0208:0246697724',
            'smp_base_url': 'https://peppol-smp.odoo.com',
            'ttl': 60,
            'service_group_url': 'https://peppol-smp.odoo.com/iso6523-actorid-upis%3A%3A0208%3A0246697724',
            'services': [
                {
                    'href': '...',
                    'document_id': 'busdox-docid-qns::urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1',
                    TODO add 'provider_name': '...',
                }
                ...
            ],
        }
        """
        base_url = self.base_url
        if self.proxy_mode == 'demo':
            base_url = PEPPOL_PROXY_URLS['prod']  # cool for testing purpose to be able to lookup real data
        params = {'peppol_identifier': peppol_identifier}
        url = urljoin(base_url, '/api/peppol/1/lookup')
        try:
            response = requests.get(url, params=params, timeout=DEFAULT_TIMEOUT)
        except requests.exceptions.RequestException as e:
            _logger.debug("failed to query peppol participant %s: %s", peppol_identifier, e)
            return

        try:
            decoded_response = response.json()
        except ValueError:
            _logger.error('invalid JSON response %s when querying peppol participant %s', response.status_code, peppol_identifier)
            return

        if error := decoded_response.get('error'):
            if error.get('code') != 'NOT_FOUND':
                _logger.error('error when querying peppol participant %s: %s', peppol_identifier, error.get('message', 'unknown error'))
            return

        if not response.ok:
            _logger.error('unsuccessful response %s when querying peppol participant %s', response.status_code, peppol_identifier)
            return

        return decoded_response.get('result')
