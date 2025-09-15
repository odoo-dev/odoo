# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
import requests

TIMEOUT = 30
LIMIT = 100

_logger = logging.getLogger(__name__)

class BigcommerceRequest:

    def request(self, marketplace_account, version, endpoint, method, params={}, payload={}):
        if not (marketplace_account.bigcommerce_access_token and marketplace_account.bigcommerce_store_hash):
            _logger.error("Required credentials are not set yet.")
            return {
                "errors": "Required credentials are not set yet."
            }
        request_url = f"https://api.bigcommerce.com/stores/{marketplace_account.bigcommerce_store_hash}/{version}/{endpoint}"
        headers = {
            "X-Auth-Token": marketplace_account.bigcommerce_access_token,
            "Accept": "application/json"
        }
        params = dict(params)  # copy to avoid modifying caller dict
        params.setdefault("limit", LIMIT)
        params.setdefault('page', 1)

        if version == "v2" and endpoint.startswith("orders"):
            return self._fetch_all_orders(request_url, headers, params, method, payload)

        # Default flow (meta-based pagination)
        return self._fetch_with_meta(request_url, headers, params, method, payload)

    def _fetch_with_meta(self, url, headers, params, method, payload):
        """Handles APIs that return meta or response in object"""
        combined_data = []
        meta_info = None

        while True:
            response = self.make_api_call(
                method=method,
                url=url,
                params=params,
                headers=headers,
                payload=payload,
                timeout=TIMEOUT
            )

            if not response:
                return {"errors": "Unexpected error. Please report this to your administrator."}

            try:
                data = response.json()
            except ValueError as e:
                _logger.error(f"Failed to decode JSON from API response. Error: {e}")
                return {"errors": "Failed to decode JSON from API response."}

            if "errors" in data:
                return {"errors": data.get("errors")}

            if isinstance(data, dict) and "data" in data:
                combined_data.extend(data.get("data", []))

                meta_info = data.get("meta", {}).get("pagination", {})
                current_page = meta_info.get("current_page", 1)
                total_pages = meta_info.get("total_pages", 1)

                if current_page >= total_pages:
                    break
                params["page"] = current_page + 1

            elif isinstance(data, dict):
                return data

            else:
                return {"errors": "Unexpected data format received from API."}

        return {"data": combined_data, "meta": meta_info}

    def _fetch_all_orders(self, url, headers, params, method, payload):
        """Handles v2 orders API pagination (no meta, returns plain list)."""
        all_orders = []

        while True:
            response = self.make_api_call(
                method=method,
                url=url,
                params=params,
                headers=headers,
                payload=payload,
                timeout=TIMEOUT
            )

            if not response:
                return {"errors": "Unexpected error. Please report this to your administrator."}

            try:
                data = response.json()
            except ValueError:
                # If decoding fails, it could mean no content (204) or bad response
                if response.status_code == 204 or not response.text.strip():
                    break  # no more orders, stop gracefully
                return {"errors": "Failed to decode JSON from Orders API response."}

            if not isinstance(data, list):
                return {"errors": "Unexpected response format for orders API."}

            if not data:
                break  # no more orders

            all_orders.extend(data)

            if len(data) < params.get("limit", LIMIT):
                break  # last page (didn't hit full limit)

            params["page"] += 1

        return all_orders

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
