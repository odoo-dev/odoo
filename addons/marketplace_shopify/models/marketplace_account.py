# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, fields, models
from odoo.exceptions import ValidationError
from ..utils.shopify_request import ShopifyRequest

shopify_request_handler = ShopifyRequest()


class MarketplaceAccount(models.Model):
    _inherit = 'marketplace.account'

    shopify_access_token = fields.Char(
        string="Shopify Access Token",
        help="Access token for Shopify API authentication.",
        required_if_channel="shopify"
    )
    shopify_store = fields.Char(
        string="Shopify Store",
        help="Shopify store name for Shopify API authentication.",
        required_if_channel="shopify"
    )
    shopify_api_version = fields.Selection(
        [
            ('2025-01', '2025-01'),
            ('2025-04', '2025-04'),
            ('2025-07', '2025-07')
        ],
        default='2025-07',
        help="Shopify API version used for API calls",
        required_if_channel="shopify"
    )

    def action_connect(self):
        self.ensure_one()
        if self.channel_code == 'shopify':
            self._authenticate_shopoify()
        return super().action_connect()

    def _authenticate_shopoify(self):
        response = shopify_request_handler.request(
            marketplace_account=self,
            endpoint='shop',
            method='GET',
        )
        if response.get('errors'):
            raise ValidationError(_(
                f"Shopify account is not authenticated: {response.get('errors')}",
            ))
        is_valid_response = response and response.get('shop') and response.get('shop', {}).get('name') and response.get('shop', {}).get('name') == self.shopify_store
        if not is_valid_response:
            raise ValidationError(_(
                f"Shopify account is not authenticated: No shop information received.",
            ))

    # def _ensure_account_is_authenticated(self):
    #     if self.channel_code != 'shopify':
    #         return super()._ensure_account_is_authenticated()
    #     response = shopify_request_handler.request(
    #         marketplace_account=self,
    #         endpoint='shop',
    #         method='GET',
    #     )
    #     if response.get('errors'):
    #         raise ValidationError(_(
    #             f"Shopify account is not authenticated: {response.get('errors')}",
    #         ))
    #     is_valid_response = response and response.get('shop') and response.get('shop', {}).get('name') and response.get('shop', {}).get('name') == self.shopify_store
    #     if not is_valid_response:
    #         raise ValidationError(_(
    #             f"Shopify account is not authenticated: No shop information received.",
    #         ))

    # for shopify marketplace.offer mp_product_identifier is its variant_id.
    def _fetch_products_from_marketplace(self):
        if self.channel_code != 'shopify':
            return super()._fetch_products_from_marketplace()
        updated_at_min_date = shopify_request_handler._convert_odoo_date_to_shopify_format(self.last_products_pull)
        response = shopify_request_handler.request(
            marketplace_account=self,
            endpoint='products',
            method='GET',
            params={'updated_at_min': updated_at_min_date, 'status': 'active'}
        ) # fetch products updated after this sync date.
        if response.get('errors'):
            result = {'error': response.get('errors')}
            return result
        is_valid_response = response and 'products' in response
        if not is_valid_response:
            result = {'error': "Unexpected Error, something is wrong."}
            return result
        response_products = []
        for shopify_product in response.get('products'):
            is_variants = not (len(shopify_product['options']) == 1
                               and shopify_product['options'][0]['name'] == 'Title'
                               and len(shopify_product['options'][0]['values']) == 1
                               and shopify_product['options'][0]['values'][0] == 'Default Title')
            for shopify_variant in shopify_product['variants']:
                response_products.append({
                    'sku': shopify_variant.get('sku', ''),
                    'name': shopify_variant['title'] if is_variants else shopify_product['title'],
                    'mp_product_identifier': str(shopify_variant['id']),
                    'mp_product_template_identifier': str(shopify_variant['product_id']),
                })
        return {'products': response_products}

    def _fetch_locations_from_marketplace(self):
        if self.channel_code != 'shopify':
            return super()._fetch_locations_from_marketplace()
        updated_at_min_date = shopify_request_handler._convert_odoo_date_to_shopify_format(self.last_location_pull)
        response = shopify_request_handler.request(
            marketplace_account=self,
            endpoint='locations',
            method='GET',
            params={'updated_at_min': updated_at_min_date, 'active': True}
        )
        if response.get('errors'):
            result = {'error': response.get('errors')}
            return result
        is_valid_response = response and 'locations' in response
        if not is_valid_response:
            result = {'error': "Unexpected error, something in wrong."}
            return result
        response_location = []
        for shopify_location in response['locations']:
            response_location.append({
                'id': shopify_location.get('id', ''),
                'name': shopify_location.get('name', ''),
            })
        return {'locations': response_location}

    def _fetch_orders_from_marketplace(self):
        if self.channel_code != 'shopify':
            return super()._fetch_orders_from_marketplace()
        updated_at_min_date = shopify_request_handler._convert_odoo_date_to_shopify_format(self.last_orders_pull)
        response_orders = shopify_request_handler.request(
            marketplace_account=self,
            method='GET',
            endpoint='orders',
            params={'updated_at_min': updated_at_min_date, 'status': 'any'}
        )   # fetch orders updated after this sync date.
        if response_orders.get('errors'):
            result = {'error': response_orders.get('errors')}
            return result
        is_valid_response = response_orders and 'orders' in response_orders
        if not is_valid_response:
            result = {'error': "Unexpected error, something in wrong."}
            return result
        result = {'orders': []}
        for order in response_orders['orders']:
            billing_address = order.get('billing_address') or (order.get('customer') or {}).get('default_address')
            shipping_address = order.get('shipping_address')
            result['orders'].append({
                'id': str(order['id']),
                'status': 'canceled' if order.get('cancelled_at') else 'confirmed',
                # 'fulfillment_type': [FBMa, FBMe]
                # 'shipping_code': None,
                # 'shipping_price': None,
                'currency_code': order.get('currency'),
                'customer_id': (order.get('customer', {}) or {}).get('id'),
                'fulfillments': self._prepare_fulfillments(order),
                'location_id': str(order.get('location_id')),
                'billing_address': {
                    'name': (billing_address.get('first_name') or '') + (billing_address.get('last_name') or ''),
                    'email': billing_address.get('email'),
                    'phone': billing_address.get('phone'),
                    'address_line_1': billing_address.get('address1'),
                    'address_line_2': billing_address.get('address2'),
                    'postal_code': billing_address.get('zip'),
                    'city': billing_address.get('city'),
                    'state_code': billing_address.get('province_code'),
                    'country_code': billing_address.get('country_code'),
                } if billing_address else {},
                'shipping_address': {
                    'name': (shipping_address.get('first_name') or '') + (shipping_address.get('last_name') or ''),
                    'email': shipping_address.get('email'),
                    'phone': shipping_address.get('phone'),
                    'address_line_1': shipping_address.get('address1'),
                    'address_line_2': shipping_address.get('address2'),
                    'postal_code': shipping_address.get('zip'),
                    'city': shipping_address.get('city'),
                    'state_code': shipping_address.get('province_code'),
                    'country_code': shipping_address.get('country_code'),
                } if shipping_address else {},
                'create_date': order.get('created_at'),
                'order_lines': [
                    {
                        'id': str(order_line.get('id')),
                        'product_data': {
                           'sku': order_line.get('sku'),
                           'name': order_line.get('variant_title'),
                           'mp_product_identifier': str(order_line.get('variant_id')),
                           'mp_product_template_identifier': str(order_line.get('product_id'))
                        },
                        'price_unit': order_line.get('price'),
                        'tax_amount': self._calculate_shopify_tax(order_line.get('tax_lines')),
                        'discount_amount': self._calculate_shopify_discount(order_line.get('discount_allocations')),
                        'qty_ordered': order_line.get('quantity', 0),
                        # 'description': '',
                        # price_total': '',
                        # 'discount_incl_tax': 0,
                        # 'discount_tax': 0,
                        # 'shipping_tax': 0
                        # 'shipping_discount': 0,
                        # 'shipping_discount_tax', 0,
                        # 'shipping_price': '',
                    }
                    for order_line in order['line_items']
                ]
            })
        return result

    def _prepare_fulfillments(self,  order):
        fulfillments = []
        for fulfillment in order.get('fulfillments'):
            if fulfillment.get('status') != 'cancelled':
                fulfillment_data = {
                    'marketplace_picking_identifier': fulfillment.get('id'),
                    'carrier_id': fulfillment.get('tracking_company', ''),
                    'tracking_number': fulfillment.get('tracking_number', ''),
                    'location_id': fulfillment.get('location_id')
                }
                line_items = []
                for line_item in fulfillment.get('line_items'):
                    data = {
                        "marketplace_line_identifier": line_item.get('id'),
                        "quantity": line_item.get('quantity')
                    }
                    line_items.append(data)
                fulfillment_data['line_items'] = line_items
                fulfillments.append(fulfillment_data)
        return fulfillments

    def _calculate_shopify_tax(self, tax_lines):
        tax = 0
        for line in tax_lines:
            tax+=float(line.get('price', 0))
        return tax

    def _calculate_shopify_discount(self, discount_lines):
        discount = 0
        for line in discount_lines:
            discount+=float(line.get('amount', 0))
        return discount

    def _push_inventory_to_marketplace(self, inventory_data):
        if self.channel_code != 'shopify':
            return super()._push_inventory_to_marketplace(inventory_data)
        shopify_variants = shopify_request_handler.request(
            marketplace_account=self,
            endpoint='variants',
            method='GET'
        )
        if shopify_variants.get('errors'):
            result = {'error': shopify_variants.get('errors')}
            return result
        is_valid_response = shopify_variants and 'variants' in shopify_variants
        if not is_valid_response:
            result = {'error': "Unexpected Error, something is wrong."}
            return result
        mapped_inventory_item_ids = {variant.get('id', ''): variant.get('inventory_item_id', '') for variant in shopify_variants['variants']}
        errors = []
        for data in inventory_data:
            inventory_item_id = mapped_inventory_item_ids.get(int(data['offer'].mp_product_identifier), '')
            if inventory_item_id:
                request_payload = {
                        'location_id': int(data['location'].marketplace_location_identifier),
                        'inventory_item_id': int(inventory_item_id),
                        'available': int(data['quantity']),
                    }
                response = shopify_request_handler.request(
                    marketplace_account=self,
                    endpoint="inventory_levels/set",
                    method='POST', 
                    payload=request_payload
                )
                if response.get('errors'):
                    errors.append(response.get('errors'))
                    continue
                is_valid_response = response and 'inventory_level' in response
                if not is_valid_response:
                    errors.append("Unexpected Error, something is wrong.")
            else:
                errors.append("Unexpected Error, something is wrong.")
        if errors:
            return {'error': ", ".join(errors)}
        return {}

    def _push_delivery_to_marketplace(self, delivery):
        if self.channel_code != 'shopify':
            return super()._push_delivery_to_marketplace(delivery)
        fulfillment_orders = shopify_request_handler.request(
            marketplace_account=self,
            method='GET',
            endpoint=f'orders/{int(delivery.sale_id.marketplace_order_identifier)}/fulfillment_orders'
        )
        if fulfillment_orders.get('errors'):
            result = {'error': fulfillment_orders.get('errors')}
            return result
        is_valid_response = fulfillment_orders and 'fulfillment_orders' in fulfillment_orders
        if not is_valid_response:
            result = {'error': "Unexpected Error, something is wrong."}
            return result

        # mapped_shopify_line_id = dictionary of {shopify_line_id: quantity}
        mapped_shopify_line_id = {
            int(move_id.sale_line_id.marketplace_line_identifier): move_id.quantity
            for move_id in delivery.move_ids
            if move_id.sale_line_id and
            move_id.sale_line_id.marketplace_line_identifier
        }
        request_order_payload = []
        for fulfillment_order in fulfillment_orders['fulfillment_orders']:
            request_payload_line = []
            for line in fulfillment_order['line_items']:
                if line['line_item_id'] in mapped_shopify_line_id:
                    request_payload_line.append({
                        'id': line['id'],
                        'quantity': int(mapped_shopify_line_id[line['line_item_id']]),
                    })
            request_order_payload.append({
                'fulfillment_order_id': fulfillment_order['id'],
                'fulfillment_order_line_items': request_payload_line,
            })
        request_payload = {
            'fulfillment': {
                'line_items_by_fulfillment_order': request_order_payload
            }
        }
        if delivery.carrier_tracking_url:
            request_payload['fulfillment']['tracking_info'] = {
                    'company': 'Other',
                    'url': delivery.carrier_tracking_url,
                    # 'number': delivery.carrier_tracking_ref,
                }
        response = shopify_request_handler.request(
            marketplace_account=self,
            endpoint='fulfillments',
            method='POST',
            payload=request_payload
        )
        if response.get('errors'):
            result = {'error': response.get('errors')}
            return result
        is_valid_response = response and 'fulfillment' in response
        if not is_valid_response:
            result = {'error': "Unexpected Error, something is wrong."}
            return result
        return {'response': response.get('fulfillment')}

    def _get_product_url(self, offer):
        if self.channel_code != 'shopify':
            return super()._get_product_url(offer)
        return f"https://admin.shopify.com/store/{self.shopify_store}/products/{offer.mp_product_template_identifier}/variants/{offer.mp_product_identifier}"
