# Part of Odoo. See LICENSE file for full copyright and licensing details.

import json
import logging

from werkzeug.urls import url_encode

from odoo import _, fields, models
from odoo.exceptions import ValidationError, UserError
from odoo.tools import urls
from odoo.tools import split_every

from odoo.addons.marketplace_amazon import const
from odoo.addons.marketplace_amazon import utils as amazon_utils
from odoo.addons.marketplace_amazon.controllers.onboarding import compute_oauth_signature


_logger = logging.getLogger(__name__)


class MarketplaceAccount(models.Model):
    _inherit = 'marketplace.account'

    amazon_client_id = fields.Char(
        string="Amazon Client ID",
        required_if_channel="amazon",
    )
    amazon_client_secret = fields.Char(
        string="Amazon Client Secret",
        required_if_channel="amazon",
    )
    amazon_base_marketplace_id = fields.Many2one(
        comodel_name='amazon.marketplace',
        string="Amazon Home Marketplace",
        help="The home marketplace of amazon account; used for authentication only.",
        required_if_channel="amazon",
    )
    # available_marketplace_ids = fields.Many2many(
    #     string="Available Marketplaces",
    #     help="The marketplaces this account has access to.",
    #     comodel_name='amazon.marketplace',
    #     relation='amazon_account_marketplace_rel',
    #     copy=False,
    # )
    # active_marketplace_ids = fields.Many2many(
    #     string="Marketplaces",
    #     help="The marketplaces this account sells on.",
    #     comodel_name='amazon.marketplace',
    #     relation='amazon_account_active_marketplace_rel',
    #     domain='[("id", "in", available_marketplace_ids)]',
    #     copy=False,
    # )
    amazon_seller_key = fields.Char(
        string="Amazon Seller Key",
        help="The identifier of the seller on Amazon.",
    )
    amazon_refresh_token = fields.Char(
        string="LWA Refresh Token",
        help="The long-lived token that can be exchanged for a new access token.",
    )
    amazon_access_token = fields.Char(
        string="LWA Access Token",
        help="The short-lived token used to query Amazon API on behalf of a seller.",
        store=False,
    )
    amazon_access_token_expiry = fields.Datetime(
        string="LWA Access Token Expiry",
        help="The moment at which the token becomes invalid.",
        default='1970-01-01',
        store=False,
    )
    amazon_restricted_data_token = fields.Char(
        string="Restricted Data Token",
        help="The short-lived token used instead of the LWA Access Token to access restricted data",
        store=False,
    )
    amazon_restricted_data_token_expiry = fields.Datetime(
        string="Restricted Data Token Expiry",
        help="The moment at which the Restricted Data Token becomes invalid.",
        default='1970-01-01',
        store=False,
    )

    def action_connect(self):
        data = super().action_connect()
        if self.channel_code == 'amazon':
            self.state = 'disconnected'
            return self._amazon_redirect_to_oauth_url()
        return data

    def _amazon_redirect_to_oauth_url(self):
        """ Build the OAuth redirect URL and redirect the user to it.

        See step 1 of https://developer-docs.amazon.com/sp-api/docs/website-authorization-workflow.

        Note: self.ensure_one()

        :return: An action to redirect the user to the OAuth URL.
        :rtype: ir.actions.act_url action
        """
        self.ensure_one()

        base_seller_central_url = self.amazon_base_marketplace_id.seller_central_url
        oauth_url = urls.urljoin(base_seller_central_url, '/apps/authorize/consent')
        base_database_url = self.get_base_url()
        metadata = {
            'account_id': self.id,
            'return_url': urls.urljoin(base_database_url, '/marketplace/amazon/return'),
            'signature': compute_oauth_signature(self.id),
        }  # The metadata included in the redirect URL after authorizing the app on Amazon.
        oauth_url_params = {
            'application_id': const.APP_ID,
            'state': json.dumps(metadata),
        }
        return {
            'type': 'ir.actions.act_url',
            'url': f'{oauth_url}?{url_encode(oauth_url_params)}',
            'target': 'self',
        }

    def _ensure_account_is_authenticated(self):
        data = super()._ensure_account_is_authenticated()
        if self.channel_code == 'amazon':
            return amazon_utils.refresh_access_token(self)
        return data

    def _remove_the_credentials(self):
        self.ensure_one()
        if self.channel_code != 'amazon':
            return super()._remove_the_credentials()
        self.amazon_seller_key = False
        self.amazon_refresh_token = False
        self.amazon_access_token = False
        self.amazon_access_token_expiry = False
        self.amazon_restricted_data_token = False
        self.amazon_restricted_data_token_expiry = False

    def _fetch_products_from_marketplace(self):
        if self.channel_code != 'amazon':
            return super()._fetch_products_from_marketplace()
        payload = {
            'marketplaceIds': self.amazon_base_marketplace_id.api_ref,
            'lastUpdatedAfter': self.last_products_pull.isoformat(sep='T') + 'Z',
            'includedData': 'attributes,productTypes,summaries',
        }
        has_next_page = True
        response_products = []
        while has_next_page:
            response = amazon_utils.make_sp_api_request(
                account=self,
                operation='searchListingsItems',
                payload=payload,
                path_parameter=self.amazon_seller_key
            )
            if response.get('error'):
                result = {'error': response.get('error')}
                return result
            for amazon_product in response.get('items'):
                response_products.append({
                    'sku': amazon_product['sku'],
                    'name': amazon_product['summaries'][0]['itemName'],
                    'mp_product_identifier': amazon_product['sku'],
                    'amazon_product_type': (amazon_product['productTypes'] and amazon_product['productTypes'][0]['productType'] or 'PRODUCT'),
                    'amazon_fulfillment_type': 'FBMe' if ('merchant_shipping_group' in amazon_product['attributes']) else 'FBMa',
                })
            has_next_page = bool(response.get('pagination', {}).get('nextToken'))
            payload['pageToken'] = response.get('pagination', {}).get('nextToken')
        return {'products': response_products}

    def _fetch_locations_from_marketplace(self):
        if self.channel_code != 'amazon':
            return super()._fetch_locations_from_marketplace()

    def _fetch_orders_from_marketplace(self):
        if self.channel_code != 'amazon':
            return super()._fetch_orders_from_markDFdetplace()
        payload = {
            'LastUpdatedAfter': self.last_orders_pull.isoformat(sep='T') + 'Z',
            'MarketplaceIds': self.amazon_base_marketplace_id.api_ref,
        }
        amazon_orders = {'orders': []}
        has_next_page = True
        while has_next_page:
            response = amazon_utils.make_sp_api_request(
                account=self,
                operation='getOrders',
                payload=payload,
            )
            if response.get('error'):
                return {'error': response.get('error')}
            has_next_page = bool(response.get('payload').get('NextToken'))
            payload['NextToken'] = response.get('payload').get('NextToken')
            amazon_orders['orders'].extend(response.get('payload').get('Orders'))
        for amazon_order in amazon_orders['orders']:
            amazon_order['OrderItems'] = self._get_amazon_items_data(amazon_order['AmazonOrderId'])
        result = {'orders': []}
        seller_skus = set()
        for order in amazon_orders['orders']:
            for order_line in order['OrderItems']:
                seller_skus.add(order_line.get('SellerSKU'))
        sku_to_products = self._get_amazon_products_by_skus(list(seller_skus))
        if sku_to_products.get('error'):
            return {'error': sku_to_products.get('error')}
        for order in amazon_orders['orders']:
            result['orders'].append({
                'id': order['AmazonOrderId'],
                'status': 'canceled' if order['OrderStatus'] == "Canceled" else 'confirmed',
                'fulfillment_type': 'FBMa' if order['FulfillmentChannel'] == 'AFN' else 'FBMe',
                'shipping_code': order.get('ShipServiceLevel'),
                'currency_code': order.get('OrderTotal', {}).get('CurrencyCode'),
                'shipping_address': {
                    'name': (order.get('ShippingAddress') or {}).get('Name', ''),
                    # 'email': order['BuyerInfo'].get('BuyerEmail', ''),
                    'phone': (order.get('ShippingAddress') or {}).get('Phone', ''),
                    'address_line_1': (order.get('ShippingAddress') or {}).get('AddressLine1', ''),
                    'address_line_2': (order.get('ShippingAddress') or {}).get('AddressLine2', ''),
                    'postal_code': (order.get('ShippingAddress') or {}).get('PostalCode', ''),
                    'city': (order.get('ShippingAddress') or {}).get('City', ''),
                    'state_code': (order.get('ShippingAddress') or {}).get('StateOrRegion', ''),
                    'country_code': (order.get('ShippingAddress') or {}).get('CountryCode', ''),
                },
                'billing_address': {
                    'name': (order.get('BuyerInfo') or {}).get('BuyerName'),
                    'email': (order.get('BuyerInfo') or {}).get('BuyerEmail'),
                },
                'create_date': order['PurchaseDate'],
                'fulfillments': [],
                # 'location_id': str(order.get('location_id')),
                # 'customer_id': (order.get('customer', {}) or {}).get('id'),
                'order_lines': [
                    {
                        'id': order_line.get('OrderItemId'),
                        'product_data': {
                            'sku': order_line.get('SellerSKU'),
                            'name': order_line.get('Title'),
                            'mp_product_identifier': str(order_line.get('SellerSKU')),
                            'amazon_product_type': sku_to_products.get(order_line.get('SellerSKU'), {}).get('product_type'),
                            'amazon_fulfillment_type': sku_to_products.get(order_line.get('SellerSKU'), {}).get('fulfillment_type'),
                        },
                        'price_unit': order_line.get('ItemPrice', {}).get('Amount'),
                        'tax_amount': order_line.get('ItemTax', {}).get('Amount'),
                        'discount_amount': order_line.get('PromotionDiscount', {}).get('Amount'),
                        'qty_ordered': order_line.get('QuantityOrdered', 0),
                         # 'description': '',
                         # price_total': '',
                         # 'discount_incl_tax': 0,
                         'discount_tax': float(order_line.get('PromotionDiscountTax', {}).get('Amount', '0.0')),
                         'shipping_tax': float(order_line.get('ShippingTax', {}).get('Amount', '0.0')),
                         'shipping_discount': float(order_line.get('ShippingDiscount', {}).get('Amount', '0.0')),
                         'shipping_discount_tax': float(order_line.get('ShippingDiscountTax', {}).get('Amount', '0.0')),
                         'shipping_price': float(order_line.get('ShippingPrice', {}).get('Amount', '0.0')),
                    }
                    for order_line in order['OrderItems']
                ]
            })
        return result

    def _get_amazon_products_by_skus(self, sellersku_list):
        sku_list = split_every(20, sellersku_list)
        result = {}
        for skus in sku_list:
            response = amazon_utils.make_sp_api_request(
                account=self,
                operation='searchListingsItems',
                payload = {
                    'marketplaceIds': self.amazon_base_marketplace_id.api_ref,
                    'includedData': 'attributes,productTypes',
                    'identifiersType': 'SKU',
                    'identifiers': ','.join(s.replace(',', '') for s in skus),
                    'pageSize': len(skus),
                },
                path_parameter=self.amazon_seller_key
            )
            if response.get('error'):
                return {'error': response.get('error')}
            result.update(
                {
                    item['sku']:
                    {
                        'product_type': (item['productTypes'] and item['productTypes'][0]['productType'] or 'PRODUCT'),
                        'fulfillment_type': ('FBMe' if ('merchant_shipping_group' in item['attributes']) else 'FBMa')
                    }
                 for item in response['items']
                })
        return result

    def _get_amazon_items_data(self, amazon_order_id):
        """ Fetch the items of an order from Amazon.

        :param str amazon_order_id: The identifier of the Amazon order.
        :return: The items of the order.
        :rtype: list of dict
        """
        items_data = []
        has_next_page = True
        payload = {}
        while has_next_page:
            response = amazon_utils.make_sp_api_request(
                account=self,
                operation='getOrderItems',
                payload=payload,
                path_parameter=amazon_order_id,
            )
            if response.get('error'):
                return {'error': response.get('error')}
            has_next_page = bool(response.get('payload').get('NextToken'))
            payload['NextToken'] = response.get('payload').get('NextToken')
            items_data.extend(response.get('payload', {}).get('OrderItems', []))
        return items_data

    def _push_inventory_to_marketplace(self, inventory_data):
        if self.channel_code != 'amazon':
            return super()._push_inventory_to_marketplace(inventory_data)
        if 1 == 1:
            # remove.
            breakpoint()
            raise ValidationError("Temporary validation error for amazon only")
        inventory_data = inventory_data.filter(lambda data: not data['offer'].amazon_fulfillment_type or data['offer'].amazon_fulfillment_type == 'FBMe')
        feed_messages = amazon_utils.build_feed_messages(inventory_data)
        json_feed = amazon_utils.build_json_feed(self, feed_messages)
        try:
            feed_ref = amazon_utils.submit_feed(
                self,
                json_feed,
                'JSON_LISTINGS_FEED',
                feed_content_type='application/json; charset=UTF-8',
            )
        except ValidationError as error:
            return {'error': str(error)}

    def _push_deliveries_to_marketplace(self, deliveries):
        if self.channel_code != 'amazon':
            return self._push_deliveries_to_marketplace(deliveries)
        if 1 == 1:
            # remove
            raise ValidationError("Temporary validation error for amazon only.")
        error = None
        try:
            amazon_utils.confirm_shipment(self, deliveries)
            _logger.info(
                "Deliveries with id %s pushed successfully to marketplace.",
                deliveries.ids
            )
            deliveries.write({'marketplace_sync_status': 'done'})
            message_post = _("This delivery has been successfully pushed to the marketplace.")
        except (UserError, ValidationError) as ex:
            _logger.error(
                "Error during push deliveries with ids %s to marketplace. error: %s",
                deliveries.ids, str(ex)
            )
            deliveries.write({'marketplace_sync_status': 'error'})
            message_post = _(f"Error during push this delivery to marketplace: {str(ex)}")
            error = str(ex)
        for delivery in deliveries:
            delivery.message_post(body=message_post)
        if error:
            return {'error': error}

    def _get_product_url(self, offer):
        if self.channel_code != 'amazon':
            return super()._get_product_url(offer)
        return f'{self.amazon_base_marketplace_id.seller_central_url}/skucentral?mSku={offer.sku}'


    # def action_update_available_marketplaces(self):
    #     """ Update available marketplaces and assign new ones to the account.

    #     :return: A rainbow-man action to inform the user about the successful update.
    #     :rtype: dict
    #     """
    #     for account in self:
    #         available_marketplaces = account._get_available_marketplaces()
    #         new_marketplaces = available_marketplaces - account.available_marketplace_ids
    #         account.write({'available_marketplace_ids': [(6, 0, available_marketplaces.ids)]})
    #         # Remove active marketplace that are no longer available
    #         account.active_marketplace_ids &= account.available_marketplace_ids
    #         account.active_marketplace_ids += new_marketplaces
    #     return {
    #         'effect': {
    #             'type': 'rainbow_man',
    #             'message': _("Successfully updated the marketplaces available to this account!"),
    #         }
    #     }

    # def _get_available_marketplaces(self):
    #     """ Fetch the API refs of the available marketplaces and return the corresponding recordset.

    #     Note: self.ensure_one()

    #     :return: The available marketplaces for the Amazon account.
    #     :rtype: recordset of `amazon.marketplace`
    #     :raise UserError: If the rate limit is reached.
    #     """
    #     self.ensure_one()

    #     self._ensure_account_is_authenticated(self, require_marketplaces=False)
    #     try:
    #         response_content = amazon_utils.make_sp_api_request(
    #             self, 'getMarketplaceParticipations'
    #         )
    #     except amazon_utils.AmazonRateLimitError:
    #         # _logger.info(
    #         #     "Rate limit reached while updating available marketplaces for Amazon account with "
    #         #     "id %s.", self.id
    #         # )
    #         raise UserError(_(
    #             "You reached the maximum number of requests for this operation; please try again "
    #             "later."
    #         ))
    #     else:
    #         available_marketplace_api_refs = [
    #             marketplace['marketplace']['id'] for marketplace in response_content['payload']
    #         ]
    #         return self.env['amazon.marketplace'].search(
    #             [('api_ref', 'in', available_marketplace_api_refs)]
    #         )
