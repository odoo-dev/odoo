import logging
import time
import functools
import threading

from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import defaultdict

from odoo import fields, models
from odoo.exceptions import ValidationError

from odoo.addons.marketplace_prestashop.utils.prestashop_api import PrestashopAPI

_logger = logging.getLogger(__name__)


class MarketplaceAccount(models.Model):
    _inherit = 'marketplace.account'

    # ===== FIELDS ===== #

    webservice_key = fields.Char(
        string="Webservice Key",
        required_if_channel="prestashop",
        help="Key used to authenticate prestashop API requests. Keep it secure."
    )

    prestashop_store = fields.Char(
        string="Store Name",
        help="Prestashop Store Name for Prestashop API authentication.",
    )

    prestashop_store_id = fields.Integer(
        string="Store ID",
        help="Prestashop Store ID for Prestashop API authentication.",
    )

    # ===== ACTION METHODS ===== #

    def action_connect(self):
        '''Connect with Prestashop using WEBSERVICE_KEY'''

        def match_store():
            store_name = (self.prestashop_store or "").strip().lower()
            prestashop_api = PrestashopAPI(self.webservice_key, self.prestashop_store_id)
            response_shops = prestashop_api._get_locations(self.last_products_pull)
            matching_location = next((shop for shop in response_shops if str(shop.get("name")).strip().lower() == store_name.strip().lower()), None)
            if not matching_location:
                raise ValidationError('Invalid Store Name.')
            else:
                location = self.env['marketplace.location'].search([
                    ('marketplace_account_id', '=', self.id)
                ], limit=1)

                if location:
                    location.write({
                        'marketplace_location_identifier': str(matching_location.get('id', '')),
                        'name': matching_location.get('name', ''),
                    })
                self.prestashop_store_id = matching_location.get('id')

        # Todo - Solve error of authentication (Error in JSON Response)
        self.ensure_one()
        if self.channel_code == 'prestashop':
            prestashop_api = PrestashopAPI(self.webservice_key)
            prestashop_api._authenticate_connection()
            match_store()
        return super().action_connect()

    # ===== OVERRIDE METHODS ===== #

    # Todo: Keep it inside the _fetch_products_from_marketplace as an inner method
    def _fetch_product_variants_parallel(self, prestashop_api, product, combination_ids, get_multilang_value):
        '''
        Run API calls for product combinations in parallel threads (like Promise.all),
        and preserve the order of combination_ids.
        '''
        def fetch_combination_values(pov_ids):
            """Fetch option values (color, size, etc.) for one combination."""
            pov_names = [None] * len(pov_ids)
            with ThreadPoolExecutor(max_workers=5) as executor:
                future_map = {
                    executor.submit(prestashop_api._get_product_combination_option_values, pov_id): idx
                    for idx, pov_id in enumerate(pov_ids)
                }
                for future in as_completed(future_map):
                    idx = future_map[future]
                    pov_id = pov_ids[idx]
                    try:
                        response = future.result()
                        povs = response[0] if response else {}
                        pov_list = povs.get('name')

                        pov_name = get_multilang_value(pov_list)
                        pov_names[idx] = pov_name
                    except Exception as ex:
                        _logger.error('Error fetching option values %s: %s', pov_id, ex)
                        pov_names[idx] = ''
            return pov_names

        results = {}

        with ThreadPoolExecutor(max_workers=5) as executor:
            future_map = {
                executor.submit(prestashop_api._get_product_combinations, cid): cid
                for cid in combination_ids
            }
            for future in as_completed(future_map):
                cid = future_map[future]
                try:
                    response = future.result()
                    combination = response[0] if response else {}

                    pov_ids = [
                        pov.get('id')
                        for pov in combination.get('associations', {}).get('product_option_values', [])
                        if pov.get('id')
                    ]

                    # Fetch option values
                    combination_values_str = ''
                    if pov_ids:
                        combination_values = fetch_combination_values(pov_ids)
                        combination_values_str = ', '.join(filter(None, combination_values))

                    # Build variant record
                    product_name = get_multilang_value(product.get('name'))
                    results[cid] = {
                        'name': (product_name + (' (' + combination_values_str + ')' if combination_values_str else '')).strip(),
                        'sku': combination.get('reference'),
                        'mp_product_identifier': str(combination.get('id', '')),
                        'mp_product_template_identifier': str(combination.get('id_product', ''))
                    }

                except Exception as ex:
                    _logger.error('Error fetching combination %s: %s', cid, ex)
                    results[cid] = None

        return [results[cid] for cid in combination_ids if results.get(cid)]

    # Todo: Keep it inside the _fetch_products_from_marketplace as an inner method
    # def _fetch_product_variants_sequential(self, prestashop_api, product, combination_ids):
    #     '''
    #     Run API calls for product combinations sequentially (one by one).
    #     Used for comparison with parallel version.
    #     '''
    #     results = []
    #     for cid in combination_ids:
    #         try:
    #             response = prestashop_api._get_product_combinations(cid)
    #             combination_dict = response.get('combination', {})
    #             results.append({
    #                 'name': product.get('name', ''),
    #                 'sku': combination_dict.get('reference', ''),
    #                 'mp_product_identifier': str(combination_dict.get('id', '')),
    #                 'marketplace_product_parent_id': str(combination_dict.get('id_product', ''))
    #             })
    #         except Exception as e:
    #             _logger.error('Error fetching combination %s: %s', cid, e)
    #     return results

    def _fetch_products_from_marketplace(self):
        '''Fetch products from PrestaShop, including variant combinations.'''

        if self.channel_code != 'prestashop':
            return super()._fetch_products_from_marketplace()

        # --- Get Products from Prestashop --- #
        prestashop_api = PrestashopAPI(self.webservice_key, self.prestashop_store_id)
        response_products = prestashop_api._get_products(self.last_products_pull)
        _logger.debug('Fetched %d products from PrestaShop', len(response_products) if response_products else 0)

        if not response_products:
            _logger.debug('No products returned from PrestaShop.')
            return {'products': []}

        # --- Language handling --- #
        response_default_language = prestashop_api._get_default_language()
        default_language = next(
            (lang for lang in response_default_language if str(lang.get('id_shop')) == str(prestashop_api.store_id)),
            {}
        )
        default_lang_id = int(default_language.get('value', 0)) or 0

        def get_multilang_value(value_list):
            """Extract correct language value or fallback."""
            if isinstance(value_list, list):
                return next((p.get('value') for p in value_list if int(p.get('id')) == default_lang_id), '') or next((p.get('value') for p in value_list if p.get('value')), '')
            return value_list or ''

        # --- Results container --- #
        products = []

        for product in response_products:
            product_id = product.get('id')
            product_type = product.get('product_type')
            product_name = get_multilang_value(product.get('name'))

            # --- Simple product --- #
            if product_type != 'combinations':
                products.append({
                    'name': product_name,
                    'sku': product.get('reference'),
                    'mp_product_identifier': str(product_id),
                    'mp_product_template_identifier': ''
                })
                continue

            # --- Product with combinations --- #
            combination_ids = [
                combo.get('id')
                for combo in product.get('associations', {}).get('combinations', [])
                if combo.get('id')
            ]

            if not combination_ids:
                _logger.debug('No combinations found for product ID %s', product_id)
                continue

            start = time.time()
            try:
                variants = self._fetch_product_variants_parallel(prestashop_api, product, combination_ids, get_multilang_value)
                # variants = self._fetch_product_variants_sequential(prestashop_api, product, combination_ids)
                products.extend(variants)
            except Exception as ex:
                _logger.error('Error fetching variants for product ID %s: %s', product_id, ex)
            finally:
                elapsed = time.time() - start
                _logger.debug(
                    'Fetched %d variants for product ID %s in %.2f seconds',
                    len(variants) if 'variants' in locals() else 0,
                    product_id, elapsed
                )
        # breakpoint()
        return {'products': products}

    # def _fetch_locations_from_marketplace(self):
    #     '''Fetch shop locations from PrestaShop.'''
    #     if self.channel_code != 'prestashop':
    #         return super()._fetch_locations_from_marketplace()

    #     prestashop_api = PrestashopAPI(self.webservice_key, self.prestashop_store_id)
    #     response_shops = prestashop_api._get_locations(self.last_products_pull)

    #     if not response_shops:
    #         _logger.debug('No shops returned from PrestaShop.')
    #         return {'locations': []}

    #     locations = [{
    #             'id': str(shop.get('id', '')),
    #             'name': shop.get('name', ''),
    #         } for shop in response_shops if shop.get('id')
    #     ]
    #     _logger.debug('Fetched %d locations from PrestaShop.', len(locations))
    #     _logger.debug('Fetched locations %s.', locations)
    #     return {'locations': locations}

    def _fetch_orders_from_marketplace(self):
        if self.channel_code != 'prestashop':
            return super()._fetch_orders_from_marketplace()
        start = time.time()
        # response = self._fetch_orders_from_marketplace_sequential()
        response = self._fetch_orders_from_marketplace_parallel(self.last_location_pull)
        end = time.time()
        print('API Time: ', end-start)
        return response

    def _fetch_orders_from_marketplace_sequential(self):
        '''Fetch sale orders from PrestaShop.'''
        if self.channel_code != 'prestashop':
            return super()._fetch_orders_from_marketplace()

        def get_order_currency_code(prestashop_api, currency_id):
            """Return the ISO currency code for a given currency ID from PrestaShop."""
            response_currency = prestashop_api._get_currency(currency_id)
            result_currency = list(filter(lambda c: c.get('id') == currency_id, response_currency))
            return result_currency[0].get('iso_code', '') if result_currency else ''

        def get_order_address(prestashop_api, address_id):
            """
            Retrieve and format an order's address details from PrestaShop.

            :rtype:
                a dictionary with fields like name, phone, address lines,
                postal code, city, state code, and country code.

            :rtype:
                Returns empty values if the address_id is missing or invalid.
            """
            if not address_id or address_id == '0':
                return {
                    'name': '',
                    'email': '',
                    'phone': '',
                    'address_line1': '',
                    'address_line2': '',
                    'postal_code': '',
                    'city': '',
                    'state_code': '',
                    'country_code': ''
                }

            def get_address_state(prestashop_api, state_id):
                """Return the ISO state code for a given state ID from PrestaShop."""
                response_states = prestashop_api._get_state(state_id)
                result_state = list(filter(lambda state: state.get('id') == state_id, response_states))
                return result_state[0].get('iso_code', '') if result_state else ''

            def get_address_country(prestashop_api, country_id):
                """Return the ISO country code for a given country ID from PrestaShop."""
                response_countries = prestashop_api._get_state(country_id)
                result_country = list(filter(lambda country: country.get('id') == country_id, response_countries))
                return result_country[0].get('iso_code', '') if result_country else ''

            response_address = prestashop_api._get_address(address_id)
            result_address = list(filter(lambda address: address.get('id') == address_id, response_address))

            return {
                'name': result_address[0].get('firstname', '') + result_address[0].get('lastname', ''),
                'email': '',
                'phone': result_address[0].get('firstname', ''),
                'address_line1': result_address[0].get('address1', ''),
                'address_line2': result_address[0].get('address2', ''),
                'postal_code': result_address[0].get('postcode', ''),
                'city': result_address[0].get('city', ''),
                'state_code': get_address_state(prestashop_api, result_address[0].get('id_state')) if result_address[0].get('id_state') else '',
                'country_code': get_address_country(prestashop_api, result_address[0].get('id_state')) if result_address[0].get('id_state') else ''
            }

        def get_order_status_id(prestashop_api, order_state_id):
            """
            Return the order status ID from PrestaShop for the given order state ID.
            """
            response_order_states = prestashop_api._get_order_state(order_state_id)
            result_order_state = list(filter(lambda state: state.get('id') == order_state_id, response_order_states))
            return result_order_state[0].get('id', 0) if result_order_state else 0

        prestashop_api = PrestashopAPI(self.webservice_key, self.prestashop_store_id)
        response_saleorders = prestashop_api._get_orders(self.last_products_pull)

        if not response_saleorders:
            _logger.debug('No shops returned from PrestaShop.')
            return {'orders': []}

        orders = [{
                'id': str(so.get('id')),
                'currency_code': get_order_currency_code(prestashop_api, so.get('id_currency')) if so.get('id_currency') else '',    # Need different API /currencies
                'status': 'canceled' if (so.get('current_state') and get_order_status_id(prestashop_api, so.get('current_state')) == 6) else 'confirmed',
                'customer_id': str(so.get('id_customer', '')),
                'create_date': str(so.get('date_add', '')),
                'update_date': str(so.get('date_upd', '')),
                # 'fulfillment_type': [FBMa, FBMe]
                'shipping_price': str(so.get('total_shipping', '0')),
                'shipping_tax_amount': str(so.get('total_shipping_tax_incl', '0')),
                # 'shipping_discount'
                'location_id': str(so.get('id_shop', '0')),
                # 'billing_address': {
                #     'name': (so.get('billing_address') or {}).get('first_name', '') + (so.get('billing_address') or {}).get('last_name', ''),
                #     'email': (so.get('billing_address') or {}).get('email'),
                #     'phone': (so.get('billing_address') or {}).get('phone'),
                #     'address_line1': (so.get('billing_address') or {}).get('address1'),
                #     'address_line2': (so.get('billing_address') or {}).get('address2'),
                #     'postal_code': (so.get('billing_address') or {}).get('zip'),
                #     'city': (so.get('billing_address') or {}).get('city'),
                #     'state_code': (so.get('billing_address') or {}).get('province_code'),
                #     'country_code': (so.get('billing_address') or {}).get('country_code'),
                #     # 'address_type': None,
                # },
                'shipping_address': get_order_address(prestashop_api, so.get('id_address_delivery', '0')),
                # 'other_addresses':
                'order_lines': [
                    {
                        'product_data': {
                            'name': order_line.get('product_name'),
                            'sku': str(order_line.get('product_reference')),
                            'mp_product_identifier': order_line.get('product_id'),
                            # 'mp_product_template_identifier':
                            # 'matched_product_id':
                            # 'marketplace_account_id':
                        },
                        'id': str(order_line.get('id')),
                        'sku': str(order_line.get('product_reference')),
                        # 'description': '',
                        'name': order_line.get('product_name'),
                        'product_id': str(order_line.get('product_attribute_id')),
                        # 'uom'
                        'qty_ordered': order_line.get('product_quantity', 0),
                        # 'qty_shipped'
                        # 'qty_delivered'
                        # 'qty_returned'
                        # 'qty_refunded'
                        # 'qty_canceled'

                        'price_unit': order_line.get('product_price', 0),
                        'price_incl_tax': order_line.get('unit_price_tax_incl', 0),
                        'price_subtotal': float(order_line.get('product_price', 0)) * int(order_line.get('product_quantity', 0))

                        # price_total': '',
                        # 'discount':
                        # 'discount_incl_tax': 0,
                        # 'discount_tax': 0,

                        # 'tax_amount_per_unit'
                        # 'tax_amount': self._calculate_shopify_tax(order_line.get('tax_lines')),
                        # 'tax_percent'
                        # 'unit_price_excluding_tax'
                        # 'unit_price_including_tax'
                        # 'discount_excluding_tax'
                        # 'discount_including_tax'
                        # 'amount_excluding_tax'
                        # 'amount_including_tax'
                        # 'undiscounted_amount_excluding_tax'
                        # 'undiscounted_amount_including_tax'
                        # 'undiscounted_unit_price_excluding_tax'
                        # 'undiscounted_unit_price_including_tax'
                        # 'discount_amount_excluding_tax'
                        # 'discount_amount_including_tax'
                        # 'discount_amount_per_unit_excluding_tax'
                        # 'discount_amount_per_unit_including_tax'
                    }
                    for order_line in so.get('associations', {}).get('order_rows', [])
                ],
                # 'shipping_code': None,
                'fulfillments': []  # self._prepare_fulfillment(order)
            } for so in response_saleorders if so.get('id')
        ]
        # breakpoint()
        return {'orders': orders}

    def _fetch_orders_from_marketplace_parallel(self, last_location_pull):
        if self.channel_code != 'prestashop':
            return super()._fetch_orders_from_marketplace()

        prestashop_api = PrestashopAPI(self.webservice_key, self.prestashop_store_id)
        response_orders = prestashop_api._get_orders(last_location_pull)

        if not response_orders:
            _logger.debug('No orders returned from PrestaShop.')
            return {'orders': []}

        _locks = defaultdict(threading.Lock)

        @functools.lru_cache(maxsize=10)
        def _get_currency_code_cached(currency_id):
            currencies = prestashop_api._get_currency(currency_id)
            return next((c.get('iso_code') for c in currencies if str(c.get('id')) == str(currency_id)), '')

        def get_currency_code(currency_id):
            if not currency_id:
                return ''
            cid = str(currency_id)
            with _locks[("currency", cid)]:
                return _get_currency_code_cached(cid)

        @functools.lru_cache(maxsize=10)
        def _get_order_status_cached(order_state_id):
            states = prestashop_api._get_order_state(order_state_id)
            return next((s.get('id') for s in states if str(s.get('id')) == str(order_state_id)), 0)

        def get_order_status(order_state_id):
            if not order_state_id:
                return 0
            sid = str(order_state_id)
            with _locks[("status", sid)]:
                return _get_order_status_cached(sid)

        @functools.lru_cache(maxsize=10)
        def _get_state_code_cached(state_id):
            states = prestashop_api._get_state(state_id)
            return next((s.get('iso_code') for s in states if str(s.get('id')) == str(state_id)), '')

        def get_state_code(state_id):
            if not state_id:
                return ''
            sid = str(state_id)
            with _locks[("state", sid)]:
                return _get_state_code_cached(sid)

        @functools.lru_cache(maxsize=10)
        def _get_country_code_cached(country_id):
            countries = prestashop_api._get_country(country_id)
            return next((c.get('iso_code') for c in countries if str(c.get('id')) == str(country_id)), '')

        def get_country_code(country_id):
            if not country_id:
                return ''
            cid = str(country_id)
            # print(_get_country_code_cached.cache_info())
            with _locks[("country", cid)]:
                response = _get_country_code_cached(cid)
                print(_get_country_code_cached.cache_info())
                return response

        @functools.lru_cache(maxsize=10)
        def get_order_address_cached(customer_id, address_id):

            def get_customer_info(customer_id):
                if not customer_id or customer_id == '0':
                    return {}

                customers = prestashop_api._get_customer(customer_id)
                customer = next((customer for customer in customers if str(customer.get('id')) == str(customer_id)), {})

                return customer

            if not address_id or address_id == '0':
                return {
                    'name': '',
                    'email': '',
                    'phone': '',
                    'address_line1': '',
                    'address_line2': '',
                    'postal_code': '',
                    'city': '',
                    'state_code': '',
                    'country_code': ''
                }
            addresses = prestashop_api._get_address(address_id)
            addr = next((a for a in addresses if str(a.get('id')) == str(address_id)), {})

            customer = get_customer_info(customer_id)
            return {
                'name': f"{addr.get('firstname', '')}{addr.get('lastname', '')}",
                'email': customer.get('email', ''),
                'phone': addr.get('phone', ''),
                'address_line1': addr.get('address1', ''),
                'address_line2': addr.get('address2', ''),
                'postal_code': addr.get('postcode', ''),
                'city': addr.get('city', ''),
                'state_code': get_state_code(addr.get('id_state')),
                'country_code': get_country_code(addr.get('id_country'))
            }

        def get_order_address(customer_id, address_id):
            if not address_id:
                return ''
            aid = str(address_id)
            cid = str(customer_id)
            key = ("address", cid, aid)

            with _locks[key]:
                response = get_order_address_cached(cid, aid)
                print(get_order_address_cached.cache_info())
                return response

        def get_carrier_name(carrier_id):
            response_carrier = prestashop_api._get_carrier(carrier_id=carrier_id)
            result_carrier = list(filter(lambda carrier: carrier.get('id') == carrier_id, response_carrier))
            return result_carrier[0].get('name', '') if result_carrier else ''

        def process_order(so):
            return {
                'id': str(so['id']),
                'currency_code': get_currency_code(so.get('id_currency')),
                'status': 'canceled' if get_order_status(so.get('current_state')) == 6 else 'confirmed',
                'customer_id': str(so.get('id_customer', '')),
                'create_date': str(so.get('date_add', '')),
                'update_date': str(so.get('date_upd', '')),
                'shipping_price': str(so.get('total_shipping', '0')),
                'shipping_tax_amount': str(so.get('total_shipping_tax_incl', '0')),
                'location_id': str(so.get('id_shop', '0')),
                'client_order_ref': so.get('reference'),
                'note': so.get('note'),
                'currency_rate': float(so.get('conversion_rate')),
                'date_order': so.get('date_add'),
                'shipping_address': get_order_address(so.get('id_customer', '0'), so.get('id_address_delivery', '0')),
                'billing_address': get_order_address(so.get('id_customer', '0'), so.get('id_address_invoice', '0')),
                'order_lines': [{
                    'product_data': {
                        'name': line.get('product_name'),
                        'sku': str(line.get('product_reference')),
                        'mp_product_identifier': line.get('product_id')
                    },
                    'id': str(line.get('id')),
                    'sku': str(line.get('product_reference')),
                    'name': line.get('product_name'),
                    'product_id': str(line.get('product_attribute_id')),
                    'qty_ordered': line.get('product_quantity', 0),
                    'price_unit': line.get('product_price', 0),
                    'price_incl_tax': line.get('unit_price_tax_incl', 0),
                    'price_subtotal': float(line.get('product_price', 0)) * int(line.get('product_quantity', 0))
                } for line in so.get('associations', {}).get('order_rows', [])],
                # 'fulfillments': [{
                #     'marketplace_picking_identifier': str(so.get('id_carrier', 0)),
                #     'carrier_id': get_carrier_name(so.get('id_carrier')),
                #     'tracking_number': so.get('shipping_number', ''),
                #     'line_items': [{
                #         'marketplace_line_identifier': str(line.get('id')),
                #         'quantity': line.get('product_quantity', 0)
                #     } for line in so.get('associations', {}).get('order_rows', [])]
                # }],
                'fulfillment_type': 'FBMe'
            }

        orders = []
        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(process_order, so) for so in response_orders if so.get('id')]
            for future in as_completed(futures):
                try:
                    # breakpoint()
                    orders.append(future.result())
                except Exception as e:
                    _logger.error(f"Failed processing order: {e}")
        return {'orders': orders}

    def _get_product_url(self, offer):
        """Return the PrestaShop product URL for a given offer."""
        if self.channel_code != 'prestashop':
            return super()._get_product_url(offer)

        prestashop_api = PrestashopAPI(self.webservice_key, self.prestashop_store_id)
        base_url = prestashop_api.client_endpoint

        if not offer:
            return base_url

        product_id = (
            offer.mp_product_template_identifier if offer.mp_product_template_identifier else offer.mp_product_identifier
        )

        return f"{base_url}/admin_odoo/sell/catalog/products/{product_id}"

    def _push_inventory_to_marketplace(self, inventory_data):
        if self.channel_code != 'prestashop':
            return super()._push_inventory_to_marketplace(inventory_data)

        # Filter inventory for this PrestaShop store
        current_store_inventory = [
            stock for stock in inventory_data
            if str(stock.get('location', {})['marketplace_location_identifier']) == str(self.prestashop_store_id)
        ]

        prestashop_api = PrestashopAPI(self.webservice_key, self.prestashop_store_id)

        # Collect unique product IDs
        unique_product_ids = {
            row.get('offer')['mp_product_template_identifier']
            if row.get('offer')['mp_product_template_identifier'] else row.get('offer')['mp_product_identifier']
            for row in current_store_inventory
        }

        # Cache product fetches to avoid repeated API calls
        @functools.lru_cache(maxsize=None)
        def fetch_product(product_id):
            return prestashop_api._get_product(product_id=product_id)

        response_products = {pid: fetch_product(pid) for pid in unique_product_ids}

        # Helper to find stock_available_id
        def get_stock_available_id(item):
            offer = item.get('offer', {})
            stock_available_id = 0

            if not offer['mp_product_template_identifier']:
                product_id = offer['mp_product_identifier']
                relative_product = response_products.get(product_id, [{}])
                stock_availables = relative_product[0].get('associations', {}).get('stock_availables', [])
                if stock_availables:
                    stock_available_id = stock_availables[0].get('id', 0)
            else:
                # Variant-level product
                product_template_id = offer['mp_product_template_identifier']
                product_id = offer['mp_product_identifier']
                relative_product = response_products.get(product_template_id, [{}])
                stock_availables = relative_product[0].get('associations', {}).get('stock_availables', [])
                if stock_availables:
                    stock = next(
                        (s for s in stock_availables if str(s.get('id_product_attribute')) == str(product_id)),
                        None
                    )
                    if stock:
                        stock_available_id = stock.get('id', 0)

            return stock_available_id

        # Add stock_available_id to each item
        for item in current_store_inventory:
            item['stock_available_id'] = get_stock_available_id(item)

        # Update inventory in parallel
        def update_stock(store_inventory):
            stock_available_id = store_inventory.get('stock_available_id', 0)
            quantity = store_inventory.get('quantity', 0)
            if stock_available_id > 0:
                return prestashop_api._set_inventory(stock_available_id=stock_available_id, quantity=quantity)
            return None

        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(update_stock, item) for item in current_store_inventory]
            # Optionally, handle responses or exceptions
            for future in as_completed(futures):
                try:
                    future.result()
                except Exception as e:
                    _logger.error('Error updating stock: %s', e)

        return {}

    def _push_delivery_to_marketplace(self, pickings):
        self.ensure_one()
        if self.channel_code != "prestashop":
            return super()._push_delivery_to_marketplace(pickings)
        order_id = pickings.sale_id.marketplace_order_identifier
        prestashop_api = PrestashopAPI(self.webservice_key, self.prestashop_store_id)
        prestashop_api._set_order_status(order_id=order_id, status_id=4)
        return {'response': {}}
