# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, fields, models
from odoo.exceptions import ValidationError
from ..utils.bigcommerce_request import BigcommerceRequest

bigcommerce_request_handler = BigcommerceRequest()

ORDER_STATUS_MAPPING = {
    "Pending": "confirmed",
    "Awaiting Payment": "confirmed",
    "Awaiting Fulfillment": "confirmed",
    "Awaiting Shipment": "confirmed",
    "Awaiting Pickup": "confirmed",
    "Partially Shipped": "confirmed",
    "Completed": "confirmed",
    "Shipped": "confirmed",
    "Cancelled": "canceled",
    "Declined": "canceled",
    "Refunded": "canceled",
    "Disputed": "canceled",
    "Manual Verification Required": "canceled",
    "Partially Refunded": "canceled"
}


class MarketplaceAccount(models.Model):
    _inherit = 'marketplace.account'

    bigcommerce_access_token = fields.Char(
        string="Bigcommerce Access Token",
        help="Access token for Bigcommerce API authentication.",
        required_if_channel="bigcommerce"
    )
    bigcommerce_store_hash = fields.Char(
        string="Bigcommerce Store Hash",
        help="Bigcommerce store hash for Bigcommerce  API authentication.",
        required_if_channel="bigcommerce"
    )

    def action_connect(self):
        self.ensure_one()
        if self.channel_code == 'bigcommerce':
            self._authenticate_bigcommerce()
        return super().action_connect()

    def _authenticate_bigcommerce(self):
        response = bigcommerce_request_handler.request(
            marketplace_account=self,
            version='v2',
            endpoint='store',
            method='GET'
        )
        if response.get('errors'):
            raise ValidationError(_(
                f"Bigcommerce account is not authenticated: {response.get('errors')}",
            ))
        is_valid_response = response and response.get(
            'id') and response.get('id') == self.bigcommerce_store_hash
        if not is_valid_response:
            raise ValidationError(_(
                "Bigcommerce account is not authenticated: No shop information received.",
            ))

    def _fetch_products_from_marketplace(self):
        if self.channel_code != 'bigcommerce':
            return super().__fetch_products_from_marketplace()
        params = {
            'include': 'variants',
            'date_modified:min': self.last_products_pull.strftime('%Y-%m-%dT%H:%M:%SZ')
        }
        response = bigcommerce_request_handler.request(
            marketplace_account=self,
            version='v3',
            endpoint='catalog/products',
            method='GET',
            params=params
        )
        if response.get('errors'):
            result = {'error': response.get('errors')}
            return result

        if not (response and "data" in response):
            return {"error": "Unexpected Error, something went wrong."}

        response_products = []
        for bigcommerce_product in response.get('data'):
            variants = bigcommerce_product.get('variants', [])
            has_variants = (len(variants) > 1 or (
                variants and len(variants[0].get('option_values', [])) > 0))

            if has_variants:
                for variant in variants:
                    option_values = variant.get('option_values', [])
                    variant_name_parts = []

                    for option_value in option_values:
                        label = option_value.get('label', '')
                        if label:
                            variant_name_parts.append(label)

                    if variant_name_parts:
                        variant_name = f"{bigcommerce_product['name']} ({' '.join(variant_name_parts)})"
                    else:
                        variant_name = f"{bigcommerce_product['name']}"

                    response_products.append({
                        'name': variant_name,
                        'mp_product_identifier': str(variant['id']),
                        'sku': variant.get('sku', ''),
                        'mp_product_template_identifier': str(bigcommerce_product['id'])
                    })
            else:
                response_products.append({
                    'name': bigcommerce_product['name'],
                    # 'mp_product_identifier': str(bigcommerce_product['id']),
                    'sku': bigcommerce_product.get('sku', ''),
                    # 'identifier_type': 'template',
                    'mp_product_template_identifier': str(bigcommerce_product['id'])
                })

        return {'products': response_products}

    def _fetch_locations_from_marketplace(self):
        if self.channel_code != 'bigcommerce':
            return super()._fetch_locations_from_marketplace()
        response = bigcommerce_request_handler.request(
            marketplace_account=self,
            version='v3',
            endpoint='inventory/locations',
            method='GET',
            params={'is_active': 'true'}
        )
        if response.get('errors'):
            result = {'error': response.get('error')}
            return result
        is_valid_response = response and 'data' in response
        if not is_valid_response:
            result = {'error': "Unexpected error, something went wrong."}
            return result
        response_location = []
        for bigcommerce_location in response.get('data', []):
            response_location.append({
                'id': bigcommerce_location.get('id', ''),
                'name': bigcommerce_location.get('label', '')
            })
        return {'locations': response_location}

    # def _fetch_orders_from_marketplace(self):
    #     if self.channel_code != 'bigcommerce':
    #         return super()._fetch_orders_from_marketplace()
    #     params = {
    #         'min_date_modified': self.last_orders_pull.strftime('%Y-%m-%dT%H:%M:%SZ'),
    #         'include': 'consignments, consignments.line_items'
    #     }
    #     response = bigcommerce_request_handler.request(
    #         marketplace_account=self,
    #         method='GET',
    #         version='v2',
    #         endpoint='orders',
    #         params=params
    #     )
    #     if isinstance(response, dict) and 'errors' in response:
    #         result = {'error': response.get('errors')}
    #         return result
    #     is_valid_response = response and len(response) > 0
    #     if not is_valid_response:
    #         result = {'error': 'No orders found.'}
    #         return result
    #     result = {'orders': []}
    #     for order in response:
    #         if order.get('status_id') == 0:
    #             continue
    #         billing_address = order.get('billing_address', {})
    #         result['orders'].append({
    #             'id': str(order['id']),
    #             'status': 'confirmed',
    #             'customer_id': order.get('customer_id'),
    #             'create_date': order.get('date_created'),
    #             'update_date': order.get('date_modified'),
    #             'currency_code': order.get('currency_code'),
    #             'fulfillments': self._prepare_fulfillment(order),
    #             'shipping_price': str(order.get('base_shipping_cost', 0)),
    #             'shipping_tax_amount': str(order.get('shipping_cost_tax', 0)),
    #             'billing_address': {
    #                 'name': f"{billing_address.get('first_name', '')} {billing_address.get('last_name', '')}".strip(),
    #                 'email': billing_address.get("email", ""),
    #                 'phone': billing_address.get("phone", ""),
    #                 'address_line_1': billing_address.get("street_1", ""),
    #                 'address_line_2': billing_address.get("street_2", ""),
    #                 'postal_code': billing_address.get("zip"),
    #                 'city': billing_address.get("city"),
    #                 'state_code': billing_address.get("state"),
    #                 'country_code': billing_address.get("country"),
    #                 'company_name': billing_address.get("company")
    #             } if billing_address else None,
    #             'other_address': [],
    #             'order_lines': self._prepare_order_lines(order)
    #         })
    #     return result

    # def _prepare_fulfillment(self, order):
    #     fulfillments = []
    #     for consignment in order.get('consignments'):
    #         for shipping in consignment.get('shipping'):
    #             for order_line in shipping.get('line_items'):
    #                 data = {
    #                     "marketplace_line_identifier": order_line.get('id'),
    #                     "quantity": order_line.get('quantity')
    #                 }
    #                 fulfillments.append(data)
    #     return fulfillments

    # def _prepare_order_lines(self, order):
    #     order_lines = []
    #     for consignment in order.get('consignments', []):
    #         for shipping in consignment.get('shipping', []):
    #             for order_line in shipping.get('line_items', []):
    #                 order_lines.append({
    #                     "id": order_line.get("id"),
    #                     "product_data": {
    #                         "name": order_line.get("name"),
    #                         "sku": order_line.get("sku"),
    #                         "mp_product_identifier": order_line.get("product_id"),
    #                     },
    #                     "qty_ordered": order_line.get("quantity"),
    #                     "qty_shipped": order_line.get("quantity_shipped"),
    #                     "qty_refunded": order_line.get("quantity_refunded"),
    #                     "price_unit": order_line.get("base_price"),
    #                     "price_incl_tax": order_line.get("price_inc_tax"),
    #                     "unit_price_excluding_tax": order_line.get("price_ex_tax"),
    #                     "price_subtotal": order_line.get("base_total"),
    #                     "price_total": order_line.get("total_inc_tax"),
    #                     "discount_incl_tax": order_line.get("discounted_total_inc_tax")
    #                 })
    #     return order_lines

    def _push_inventory_to_marketplace(self, inventory_data):
        if self.channel_code != 'bigcommerce':
            return super()._push_inventory_to_marketplace(inventory_data)

        MAX_BATCH = 2000

        # Convert inventory_data into BigCommerce items
        items = []
        for record in inventory_data:
            offer = record.get('offer')
            location = record.get('location')
            quantity = record.get('quantity', 0)

            # Decide whether to send product_id or variant_id
            if offer.mp_product_identifier:
                item = {
                    "variant_id": int(offer.mp_product_identifier),
                    "location_id": int(location.marketplace_location_identifier),
                    "quantity": int(quantity),
                }
            else:
                item = {
                    "product_id": int(offer.mp_product_template_identifier),
                    "location_id": int(location.marketplace_location_identifier),
                    "quantity": int(quantity),
                }

            items.append(item)

        # Split into chunks of 2000
        for i in range(0, len(items), MAX_BATCH):
            batch = items[i:i + MAX_BATCH]
            payload = {
                "reason": "Absolute adjustment reason",
                "items": batch,
            }

            response = bigcommerce_request_handler.request(
                marketplace_account=self,
                version='v3',
                endpoint='inventory/adjustments/absolute',
                method='PUT',
                payload=payload
            )

            if response.get('errors'):
                return {'error': response.get('errors'), 'batch': i // MAX_BATCH + 1}

            if not response or 'transaction_id' not in response:
                return {'error': "Unexpected error, something went wrong", 'batch': i // MAX_BATCH + 1}

        return {}

    def _get_product_url(self, offer):
        if self.channel_code != 'bigcommerce':
            return super()._get_product_url(offer)
        return f"https://store-{self.bigcommerce_store_hash}.mybigcommerce.com/manage/products/edit/{offer.mp_product_template_identifier}"
