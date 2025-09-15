import logging
from json import JSONDecodeError

import requests


_logger = logging.getLogger(__name__)


PAGE_SIZE_FETCH_LIMIT = 100


# MagentoRequest MagentoServer MagentoApi
class MagentoClient():
    def __init__(self, marketplace_account):
        self.base_url = marketplace_account.magento_base_url
        self.username = marketplace_account.magento_username
        self.password = marketplace_account.magento_password
        self.access_token = marketplace_account.magento_access_token

    def _get_access_token(self):
        pass

    # make_request
    def call_api(self, endpoint, method="GET", data=None):
        pass


def get_access_token_from_magento(endpoint, username, password):
    url = f"{endpoint}/rest/V1/integration/admin/token"
    payload = {
        "username": username,
        "password": password,
    }
    headers = {'Content-Type': 'application/json'}
    try:
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()
        return {'access_token': response.text.strip('"')}
    except requests.exceptions.RequestException as e:
        _logger.exception("Error authenticating with Magento: %s", str(e))
        return {'error': "Error authenticating with Magento: %s" % str(e)}
    except requests.exceptions.HTTPError as e:
        _logger.exception("HTTP error occurred: %s - %s", str(e), response.text)
        return {'error': "HTTP error occurred: %s - %s" % (str(e), response.text)}


def call_magento(mp_account, method, route, params=None, payload=None, refresh_token_on_401=True):
    endpoint = mp_account.magento_base_url
    username = mp_account.magento_username
    password = mp_account.magento_password
    access_token = mp_account.magento_access_token

    url = f"{endpoint}/rest/V1{route}"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    try:
        response = requests.request(method, url, params=params, headers=headers, json=payload)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        _logger.exception("Error calling Magento API: %s", str(e))
        return {"error": "Error calling Magento API: %s" % str(e)}
    except requests.exceptions.HTTPError as e:
        if response.status_code == 401 and refresh_token_on_401:
            _logger.exception("Unauthorized access to Magento API: %s", str(e))
            response2 = get_access_token_from_magento(endpoint, username, password)
            if 'error' in response2:
                return {'error': "Error re-authenticating with Magento: %s" % response2['error']}
            new_access_token = response2['access_token']
            return call_magento(endpoint, username, password, new_access_token, method, route, params, payload, False)
        elif response.status_code == 404:
            _logger.exception("API path not found: %s", url)
            return {"error": "API path not found: %s" % url}
        else:
            _logger.exception("HTTP error occurred: %s", str(e))
            return {"error": "HTTP error occurred: %s" % str(e)}
    except JSONDecodeError:
        _logger.exception("Failed to decode JSON response from Magento API.")
        return {"error": "Failed to decode JSON response from Magento API response."}
