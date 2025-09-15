# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
import requests
from datetime import datetime

TIMEOUT = 30
LIMIT = 100

_logger = logging.getLogger(__name__)

class ShopifyRequest:

    def request(self, marketplace_account, endpoint, method, params={}, payload={}):
        if not (marketplace_account.shopify_access_token and marketplace_account.shopify_store):
            _logger.error("Required credentials are not set.")
            return {
                "errors": "Required credentials are not set"
            }
        request_url =  f"https://{marketplace_account.shopify_store}.myshopify.com/admin/api/{marketplace_account.shopify_api_version}/{endpoint}.json"
        headers = {
            "X-Shopify-Access-Token": marketplace_account.shopify_access_token,
            "Content-Type": "application/json",
        }
        params['limit'] = LIMIT
        response = self.make_api_call(
            method=method,
            url=request_url,
            params=params,
            headers=headers,
            timeout=TIMEOUT,
            payload=payload
        )
        if not response:
            message = "Unexpected error. Please report this to your administrator."
            _logger.error(message)
            return { "errors": message }
        data = response.json()
        if data.get("errors"):
            _logger.error(f"Unexpected error: {data.get('errors')}")
            return data
        link_header = response.headers.get('Link', '')
        is_next_page = 'rel="next"' in link_header
        while is_next_page:
            parts = link_header.split(',')
            is_next_page = False
            for part in parts:
               if 'rel="next"' in part:
                    next_url = part.split(";")[0].strip()[1:-1]  # remove <>
                    response = self.make_api_call(
                        method=method,
                        url=next_url,
                        params={},
                        headers=headers,
                        timeout=TIMEOUT
                    )
                    if not response:
                        _logger.error("Unexpected error. please report this to your administrator.")
                        return {
                             "errors": "Unexpected error. please report this to your administrator."
                        }
                    result = response.json()
                    error_message = result.get("errors")
                    if error_message:
                        _logger.error(f"Unexpected error: {error_message}")
                        return {
                            "errors": error_message
                        }
                    link_header = response.headers.get('Link', '')
                    is_next_page = 'rel="next"' in link_header
                    data[endpoint].extend(result.get(endpoint))
        return data

    def make_api_call(self, method, url, params, headers, timeout, payload={}):
        response = None
        try:
            response = requests.request(
                method=method,
                url=url,
                params=params,
                headers=headers,
                timeout=timeout,
                json=payload if payload else None,
            )
            response.raise_for_status()
            return response
        except (ValueError, requests.exceptions.ConnectionError, requests.exceptions.MissingSchema,
                requests.exceptions.Timeout, requests.exceptions.HTTPError, requests.exceptions.RequestException, requests.exceptions.InvalidURL) as ex:
            return response

    def _convert_shopify_date_to_odoo_format(self, shopify_date):
        """Converts Shopify ISO 8601 date to Odoo datetime format"""
        try:
            if not shopify_date:
                return False
            date_obj = datetime.fromisoformat(shopify_date.replace('Z', '+00:00'))
            formatted_date = date_obj.strftime('%Y-%m-%d %H:%M:%S')
            return formatted_date
        except Exception as e:
            return False

    def _convert_odoo_date_to_shopify_format(self, odoo_date):
        try:
            if not odoo_date:
                return False
            return odoo_date.isoformat()+'Z'
        except Exception as e:
            return False

    # def _find_shopify_order_state(self, shopify_order):
    #     """Determine appropriate order state based on Shopify order data"""
    #     fulfillment_status = shopify_order.get('fulfillment_status')
    #     financial_status = shopify_order.get('financial_status')
        
    #     if fulfillment_status == 'fulfilled':
    #         return 'sale'
    #     elif fulfillment_status is None:
    #         if financial_status == 'paid':
    #             return 'sale'
    #         elif financial_status == 'partially_paid':
    #             return 'sent'
    #         elif financial_status == 'refunded':
    #             return 'cancel'
    #         else:
    #             return 'draft'
    #     elif fulfillment_status == 'restocked':
    #         return 'cancel'
    #     else:
    #         return 'draft'


    # def generate_access_toekn_url(self, store_name):
    #     "https://your-store.myshopify.com/admin/oauth/access_token"

    # def generate_access_token(self, api_key, api_secret):
    #     URL = self.generate_access_toekn_url(self.store_name)
    #     headers = {
    #         "X-Shopify-Access-Token": self.shopify_access_token,
    #         "Content-Type": "application/json"
    #     }
    #     response = requests.get(URL, headers=headers)
    #     try:
    #         response = requests.request(
    #             http_method="GET",
    #             url=URL,
    #             headers=headers,
    #             timeout=TIMEOUT,
    #         )
    #         if response.status_code == 401 :
    #             self._log_message(f"Unauthorized: {URL}", "authenticate_shopify", "ERROR")
    #         if response.status_code == 404:
    #             self._log_message(f"API not found: {URL}", "authenticate_shopify", "ERROR")
    #         response.raise_for_status()
    #         return response
    #     except (ValueError, requests.exceptions.ConnectionError, requests.exceptions.MissingSchema,
    #             requests.exceptions.Timeout, requests.exceptions.HTTPError, requests.exceptions.RequestException) as ex:
    #         message = _(f"Unexpected error: {ex}. please report this to your administrator.")
    #         self._log_message(message, "authenticate_shopify", "ERROR")
    #         return response
