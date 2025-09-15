# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
import requests
# from datetime import datetime
from datetime import datetime
from odoo.exceptions import UserError
from odoo import _, fields, models



TIMEOUT = 30

_logger = logging.getLogger(__name__)

def _convert_odoo_date_to_wc_format(odoo_date):
    try:
        if not odoo_date:
            return False
        return odoo_date.isoformat()+'Z'
    except Exception as e:
        return False

def call_wc(account, method, route='', params={}, data={}):
    base_url = account.wc_store_url
    url = f"{base_url}/wp-json/wc/v3/{route}"
    params = {
       'consumer_key': account.wc_consumer_key,
       'consumer_secret': account.wc_consumer_secret,
       **params
    }
    try:
        response = requests.request(method, url, params=params, data=data, verify=False)  # verify attribute add for testing
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        _logger.error("Error calling WooCommerce API: %s", str(e))
        raise UserError(_("Unable to reach WooCommerce API. Ensure that the server is online and your credentials are correct."))
    except requests.exceptions.HTTPError as e:
        if response.status_code == 401:
            _logger.error("Unauthorized access to WooCommerce API: %s", str(e))
            raise UserError(_("Unauthorized access to WooCommerce API. Check your credentials."))
        elif response.status_code == 404:
            _logger.error("API path not found: %s", url)
            raise UserError(_("API path not found: %s") % url)
        else:
            _logger.error("HTTP error occurred: %s", str(e))
            raise UserError(_("HTTP error occurred: %s") % str(e))
    except requests.exceptions.JSONDecodeError:
        _logger.error("Failed to decode JSON response from WooCommerce API.")
        raise UserError(_("Failed to decode JSON response from WooCommerce API response."))
    except Exception as e:
        _logger.error("An unexpected error occurred: %s", str(e))
        raise UserError(_("An unexpected error occurred: %s") % str(e))

ORDER_STATUS_MAPPING = {
    'pending': 'confirmed',
    'processing': 'confirmed',
    'on-hold': 'confirmed',
    'completed': 'confirmed',
    'cancelled': 'canceled',
    'refunded': 'canceled',
    'failed': 'canceled',
    'trash': 'canceled'
}
