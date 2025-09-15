import base64
import logging
import requests
import xml.etree.ElementTree as ET

from odoo import _
from odoo.exceptions import UserError, ValidationError
from odoo.addons.marketplace_prestashop.utils.prestashop_exception import PrestashopError

_logger = logging.getLogger(__name__)

# Todo: Remove once development is done
IS_LIVE = 0
# http://oceanlike-neatly-ally.ngrok-free.app/
DEFAULT_ENDPOINT = 'http://localhost:8080/api' if IS_LIVE == 0 else ''
DEFAULT_CLIENT_ENDPOINT = 'http://localhost:8080' if IS_LIVE == 0 else ''
# DEFAULT_ENDPOINT = 'http://oceanlike-neatly-ally.ngrok-free.app/api' if IS_LIVE == 0 else ''
# DEFAULT_CLIENT_ENDPOINT = 'http://oceanlike-neatly-ally.ngrok-free.app' if IS_LIVE == 0 else ''
# DEFAULT_WEBSERVICE_KEY = 'BANQC6SYZBTHJHYUK2DQE8LQ7KRGEF64'
DEFAULT_WEBSERVICE_KEY = 'BI9CQF7TQLA1KNYJVEKT4BYA87XA2A1E' if IS_LIVE == 0 else ''
DEAFULT_STORE_ID = 1 if IS_LIVE == 0 else 1


class PrestashopAPI():

    def __init__(self, webservice_key=DEFAULT_WEBSERVICE_KEY, store_id=DEAFULT_STORE_ID, endpoint=DEFAULT_ENDPOINT, client_endpoint=DEFAULT_CLIENT_ENDPOINT):
        """Initialize the PrestaShop API client.

        :params:
            webservice_key: Webservice key provided by PrestaShop.
            endpoint: API endpoint URL for PrestaShop push/pull operations.
        """
        self.webservice_key = webservice_key
        self.store_id = store_id
        self.endpoint = endpoint.rstrip('/')
        self.client_endpoint = client_endpoint.rstrip('/')

    # ===== HELPER METHODS ===== #

    def __get_auth_header(self):
        """Build the authentication header for PrestaShop API requests.

        :return: Dictionary containing the HTTP Basic Auth header.
        :rtype: dict
        :raises PrestashopError: If the webservice key is missing.
        """
        if not self.webservice_key:
            raise PrestashopError('Missing PrestaShop webservice key')

        auth_string = f'{self.webservice_key}:'
        b64_auth = base64.b64encode(auth_string.encode('utf-8')).decode('utf-8')
        return {'Authorization': f'Basic {b64_auth}'}

    def __api_request(self, method, url, headers, data=False, endpoint_include=False):
        """Make a request to the PrestaShop API.

        :params:
            method (str): HTTP method (GET, POST, PUT, DELETE).
            url (str): Relative or full endpoint.
            headers (dict): Optional headers.
            data (dict/str): Optional request payload.
            endpoint_include (bool): If True, use `url` as full path, otherwise join with self.endpoint.

        :rtype:
            requests.Response: Raw response object.

        :raises:
            PrestashopError: If authentication fails or network error occurs.
        """
        headers = headers or {}

        if not self.webservice_key:
            err_msg = 'Invalid credentials: Missing Prestashop webservice key'
            _logger.error(err_msg)
            raise PrestashopError(err_msg)

        call_url = url if endpoint_include else (self.endpoint + url)
        headers.update(self.__get_auth_header())

        _logger.debug('Calling PrestaShop API: %s %s | data=%s', method, call_url, bool(data))

        try:
            res = requests.request(method, call_url, headers=headers, data=data, timeout=30)
            # res.raise_for_status()
            # print('API Response', res.json())
            return res
        except requests.exceptions.Timeout:
            _logger.error('PrestaShop API request timed out: %s', call_url)
            raise PrestashopError('Timeout while calling PrestaShop API', error_code=408)
        except requests.exceptions.RequestException as ex:
            _logger.error('Network error while calling PrestaShop API: %s', ex)
            raise PrestashopError(f'Network error: {str(ex)}')

    def __check_isvalid(self, response):
        """Validate a PrestaShop API response.

        :params:
            response (requests.Response): The HTTP response object returned by the API request.

        :rtype:
            bool: True if the response is valid.

        :raises:
            ValidationError: For client-side errors (HTTP 4xx) or known PrestaShop JSON 'errors'.
            UserError: For server-side errors (HTTP 5xx) or specific PrestaShop errors.
            PrestashopError: For unexpected response status codes or invalid JSON responses.
        """
        status = response.status_code

        if status not in (200, 201):
            msg = f'PrestaShop API Error {status}: {response.text[:300]}'
            if 400 <= status < 500:
                _logger.error('Client error: %s', msg)
                raise ValidationError(_(msg))
            elif 500 <= status < 600:
                _logger.error('Server error: %s', msg)
                raise UserError(_(msg))
            else:
                _logger.error('Unexpected response status: %s', msg)
                raise PrestashopError(msg, error_code=status)

        content_type = response.headers.get("Content-Type", "").lower()
        if "application/json" in content_type:
            try:
                payload = response.json()
            except ValueError:
                _logger.error('Invalid JSON in PrestaShop response: %s', response.text[:300])
                raise PrestashopError('Invalid JSON response from PrestaShop', error_code=status)
        elif "xml" in content_type or response.text.strip().startswith("<"):
            try:
                payload = self._xml_str_to_dict(response.text)
            except Exception as e:
                _logger.error('Invalid XML in PrestaShop response: %s', str(e))
                raise PrestashopError('Invalid XML response from PrestaShop', error_code=status)
        else:
            payload = response.text

        if payload in ([], {}, None, ''):
            return True

        if isinstance(payload, dict) and 'errors' in payload:
            errors = payload.get('errors', {})
            if isinstance(errors, dict):
                errors = [errors]
            elif not isinstance(errors, list):
                errors = [{'code': 600, 'message': str(errors)}]

            error_messages = [f"[Code {e.get('code', 600)}] {e.get('message','Unknown error')}" for e in errors]

            for em in error_messages:
                _logger.error('Prestashop API error: %s', em)

            raise UserError(_('Prestashop Error:\n' + '\n'.join(error_messages)))

        return True

    def _xml_str_to_dict(self, xml_str):
        """Convert the XML type string to Dict"""
        def etree_to_dict(elem):
            result = {}
            # Handle Attributes
            if elem.attrib:
                result.update({f"@{k}": v for k, v in elem.attrib.items()})

            # Handle Children
            children = list(elem)
            if children:
                # Regroup children by tag
                children_result = {}
                for child in children:
                    child_dict = etree_to_dict(child)
                    tag = child.tag
                    if tag not in children_result:
                        children_result[tag] = []
                    children_result[tag].append(child_dict)

                # Simplify single element lists
                for k, v in children_result.items():
                    if len(v) == 1:
                        children_result[k] = v[0]
                result.update(children_result)
            else:
                # Plain text
                text = elem.text.strip() if elem.text else ''
                if text:
                    if result:
                        result['#text'] = text
                    else:
                        result = text
            return result

        root = ET.fromstring(xml_str)
        data_dict = {root.tag: etree_to_dict(root)}

        return data_dict

    def __resource_request(self, resource, method='GET', resource_id=0, last_pull_date=None, display='full', custom_filter='', body=None):
        """
        Fetch or update a PrestaShop resource (products, orders, shops, etc.).

        :params:
            resource (str): The type of resource (e.g., 'products', 'orders', 'shops').
            method (str, optional): HTTP method ('GET', 'PATCH'). Defaults to 'GET'.
            resource_id (int, optional): Specific resource ID. Defaults to 0 (fetch all).
            last_pull_date (str, optional): Only for GET. Fetch records updated after this date.
            display (str, optional): Only for GET. Fields to fetch. Defaults to 'full'.
            custom_filter (str, optional): Custom filter for GET requests.
            body (dict/str, optional): Only for PATCH. Request body to send.

        :rtype:
            list[dict]: A list of resource records from PrestaShop.

        :raises:
            PrestashopError: If the response is invalid JSON or the API call fails.
        """
        headers = {'output_format': 'JSON'}

        # Build URL
        url_resource_id = f'/{resource_id}' if str(resource_id) != '0' else ''
        url = f'/{resource}{url_resource_id}'

        if method.upper() == 'GET':

            date_filter = f'&filter[date_add]=>[{last_pull_date}]&date=1' if last_pull_date else ''
            store_filter = f'&id_shop={self.store_id}' if self.store_id else ''
            url += f'?display={display}{date_filter}{custom_filter}{store_filter}'

            _logger.debug('Fetching PrestaShop resource: %s | url=%s', resource, url)
        else:
            _logger.debug('Updating PrestaShop resource: %s | url=%s', resource, url)

        response = self.__api_request(method=method.upper(), url=url, headers=headers, data=body)
        self.__check_isvalid(response)

        try:
            payload = response.json()
        except ValueError:
            _logger.error('Invalid JSON response while fetching %s: %s', resource, response.text[:300])
            raise PrestashopError(f'Invalid JSON response from PrestaShop when accessing {resource}')

        if isinstance(payload, dict):
            # Todo: Bug - Single resource problem resource='stock_availables' but response contains 'stock_available'
            return payload.get(resource, [])
        elif isinstance(payload, list):
            return payload
        else:
            _logger.error('Unexpected response type while fetching %s: %s', resource, type(payload))
            return []

    # ===== API METHODS ===== #

    def _authenticate_connection(self):
        """Check whether the PrestaShop account connection is valid.

        :params:
            None

        :rtype:
            dict: Parsed JSON response from the PrestaShop API.

        :raises:
            PrestashopError: If the response is not valid JSON or the API check fails.
        """
        header = {}
        response = self.__api_request(method='GET', url='', headers=header)

        self.__check_isvalid(response)
        content_type = response.headers.get("Content-Type", "").lower()
        if "application/json" in content_type:
            return response.json()
        elif "xml" in content_type or response.text.strip().startswith("<"):
            return self._xml_str_to_dict(response.text)
        else:
            return response.text

    def _get_products(self, last_pull_date=None):
        default_active_filter = '&filter[active]=1'
        return self.__resource_request(resource='products', last_pull_date=last_pull_date, custom_filter=default_active_filter)

    def _get_product(self, product_id, last_pull_date=None):
        return self.__resource_request(resource='products', resource_id=product_id)

    def _get_stock_available(self, product_id, last_pull_date=None):
        return self.__resource_request(resource='stock_availables', resource_id=product_id)

    def _get_product_combinations(self, combination_id, last_pull_date=None):
        return self.__resource_request(resource='combinations', resource_id=combination_id)

    def _get_orders(self, last_pull_date=None):
        return self.__resource_request(resource='orders', last_pull_date=last_pull_date)

    def _get_locations(self, last_pull_date=None):
        return self.__resource_request(resource='shops')

    def _get_currency(self, currency_id, last_pull_date=None):
        return self.__resource_request(resource='currencies', resource_id=currency_id)

    def _get_address(self, address_id, last_pull_date=None):
        return self.__resource_request(resource='addresses', resource_id=address_id)

    def _get_customer(self, address_id, last_pull_date=None):
        return self.__resource_request(resource='customers', resource_id=address_id)

    def _get_state(self, state_id, last_pull_date=None):
        return self.__resource_request(resource='states', resource_id=state_id)

    def _get_country(self, country_id, last_pull_date=None):
        return self.__resource_request(resource='countries', resource_id=country_id)

    def _get_order_state(self, order_state_id, last_pull_date=None):
        return self.__resource_request(resource='order_states', resource_id=order_state_id)

    def _get_product_combination_option_values(self, product_option_value_id, last_pull_date=None):
        return self.__resource_request(resource='product_option_values', resource_id=product_option_value_id)

    def _get_languages(self, last_pull_date=None):
        return self.__resource_request(resource='languages')

    def _get_carrier(self, carrier_id, last_pull_date=None):
        return self.__resource_request(resource='carriers', resource_id=carrier_id)

    def _get_default_language(self, last_pull_date=None):
        default_lang_filter = f'&filter[name]=PS_LANG_DEFAULT&filter[id_shop]={self.store_id}'
        return self.__resource_request(resource='configurations', custom_filter=default_lang_filter)

    def _build_xml(self, resource_name, fields):
        """
        Build XML for PrestaShop API.

        :param resource_name: str, e.g. "stock_available", "order_history"
        :param fields: dict, key = field name, value = field value
        :return: str XML string
        """
        root = ET.Element("prestashop", {"xmlns:xlink": "http://www.w3.org/1999/xlink"})
        resource = ET.SubElement(root, resource_name)

        for key, value in fields.items():
            ET.SubElement(resource, key).text = str(value)

        return ET.tostring(root, encoding="utf-8", xml_declaration=True).decode("utf-8")

    def _set_inventory(self, stock_available_id, quantity):
        """
        Update stock quantity for a specific PrestaShop stock_available ID.

        :params:
            stock_available_id (int): The ID of the stock_available record.
            quantity (int/float): Quantity to set.

        :returns:
            dict/list: Response from PrestaShop API.
        """
        xml_body = self._build_xml("stock_available", {
            "id": stock_available_id,
            "quantity": int(quantity)
        })
        return self.__resource_request(resource="stock_availables", method="PATCH", resource_id=stock_available_id, body=xml_body)

    def _set_order_status(self, order_id, status_id):
        """
        Update delivery (order status) to Prestashop.

        :params:
            order_id (int): The ID of the order record.
            status_id (int):
                1: Awaiting check payment
                2: Payment accepted
                3: Processing in progress
                4: Shipped
                5: Delivered
                6: Canceled
                7: Refunded
                8: Payment Error
                9: On backorder (paid)
                10: Awaiting bank wire payment
                11: Remote payment accepted
                12: On backorder(not paid)
                13: Awaiting Cash on Delivery Validation
                14: Waiting for payment
                15: Partial refund
                16: Patial payment
                17: Authorized. To captured by merchant
                18+ : Custom

        :returns:
            dict/list: Response from PrestaShop API.
        """

        xml_body = self._build_xml("order_history", {
            "id_order": order_id,
            "id_order_state": int(status_id)
        })
        return self.__resource_request(resource="order_histories", method="POST", body=xml_body)
