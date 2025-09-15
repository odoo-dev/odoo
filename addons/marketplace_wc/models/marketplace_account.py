# Part of Odoo. See LICENSE file for full copyright and licensing details.
import datetime
import logging
import requests

from werkzeug.urls import iri_to_uri, url_join

from odoo import _, fields, models

from urllib.parse import urlencode
from odoo.exceptions import UserError, ValidationError
from odoo.http import request
from odoo.service.model import PG_CONCURRENCY_EXCEPTIONS_TO_RETRY as CONCURRENCY_ERRORS

from .. utils import wc_request as wc_utils

_logger = logging.getLogger(__name__)


class MarketplaceAccount(models.Model):
    _inherit = 'marketplace.account'

    wc_consumer_key = fields.Char(
        string="Consumer Key",
        # required_if_channel="wc",
        help="Access token for Woocommerce API authentication."
    )
    wc_consumer_secret = fields.Char(
        string="Consumer Secret",
        # required_if_channel="wc",
        help="Access token for Woocommerce API authentication."
    )
    wc_store_url = fields.Char(
        string="Woocommerce Store Url",
        # required_if_channel='wc'
    )

    # Authentication
    def action_connect(self):
        if self.channel_code != 'wc':
            return super().action_connect()
        if self.authorization_type == 'oauth':
            if not self.wc_store_url:
                raise UserError(_("Please enter store url"))
            self._wc_check_store_url()
            url=f"{self.wc_store_url}/wc-auth/v1/authorize".replace("https://", "http://")
            base_url=self.get_base_url().replace("http://", "https://")
            params = {
                "app_name": "odoo-testing-app",
                "scope": "read_write",
                "user_id": f"{self.env.user.id}:{self.id}",
                "return_url": f"{base_url}/odoo/action-530/{self.id}",
                "callback_url": f"{base_url}/woocommerce/callback"
            }
            return {
                "type": "ir.actions.act_url",
                "url": f"{url}?{urlencode(params)}",
                "target": "new",
            }
        else:
            response = self._wc_check_store_url()
            if response:
                self.state = 'connected'

    def _remove_the_credentials(self):
        if self.channel_code != 'wc': 
            return super().action_connect()
        self.ensure_one()
        self.write({
            'wc_store_url': False,
            'wc_consumer_key': False,
            'wc_consumer_secret': False,
        })
        self.state='connected'
        return {
            'type': 'ir.actions.client',
            'tag': 'reload',
        }

    # pull product
    def _fetch_products_from_marketplace(self):
        if self.channel_code != 'wc':
            return super()._fetch_products_from_marketplace()
        product_tmpls = self._wc_fetch_product_tmpl()
        product_name_by_id = {product['id']: product['name'] for product in product_tmpls}
        # product_ids = list(product_name_by_id.keys())
        products = self._wc_fetch_products(product_tmpls=product_tmpls)
        if isinstance(products, Exception):
            _logger.error(f"Error while fetching product variations: {products}")
            return {"error": str(products)}
        structured_product = self._wc_build_structured(products, product_name_by_id)
        return {'products': structured_product}

    def _wc_fetch_product_tmpl(self):
            created_at_min_date = wc_utils._convert_odoo_date_to_wc_format(self.last_products_pull)
            products = wc_utils.call_wc(
                account=self,
                method='GET',
                route='products',
                params={'modified_after': created_at_min_date}
            )
            response = [product for product in products if product.get('type') in ['variable', 'simple']]
            return response

    def _wc_fetch_products(self, **kwargs):
        response = []
        try:
            for product_tmpl in kwargs['product_tmpls']:
                if product_tmpl.get('type') == 'simple':
                    response.append(product_tmpl)
                    continue
                product_variation = wc_utils.call_wc(
                    account=self,
                    method='GET',
                    route=f"products/{product_tmpl.get('id')}/variations"
                )
                if product_variation:
                    response += product_variation
            return response
        except Exception as error:
            return error

    def _wc_build_structured(self, products, product_name_by_id):
        structure_product = []
        for product in products:
            variant_name = (
                product.get('name')
                if product.get('type') == 'simple'
                else f"{product_name_by_id.get(product.get('parent_id'), '')} ({product.get('name')})"
            )
            product_data = {
                'sku': product.get('sku') if product.get('sku') else None,
                'name': variant_name,
                'mp_product_identifier': product.get('id'),
                'mp_product_template_identifier': product.get('parent_id'),
                # If parent_id exists → it's a variation (child product).
                # If parent_id is 0/None → it's a template (parent product)
                'identifier_type': 'product' if product.get('parent_id') else 'template'  # when parent_id 0 it means this product is parent
            }
            structure_product.append(product_data)
        return structure_product

    # push product
    # def _push_products_to_marketplace(self, products):
    #     if self.channel_code != 'wc':
    #         return super()._push_products_to_marketplace()
    #     for product in products:
    #         pass
            # product_variants = product.product_variant_ids.filter(lambda v: v.is_published == False)
            # for product_variant in product_variants:
            #     product_variant.product_template_variant_value_ids

            #     parent_id = ''
            #     data = {
            #         'regular_price':product_variant,
            #         'attributes': [
            #             {

            #             }
            #         ]
            #     }
            #     result = wc_utils.request(marketplace_account=self, endpoint=f'products/{parent_id}/variations', json=data

    # orders 
    def _fetch_orders_from_marketplace(self):
        if self.channel_code != 'wc':
            return super()._fetch_orders_from_marketplace()
        orders = wc_utils.call_wc(self, 'GET', route='orders')
        if not orders:
            _logger.info("No orders were found in WooCommerce.")
            return {"error": "No orders were found in WooCommerce."}
        structured_orders = []
        for order in orders:
            if order.get('status') != 'checkout-draft':
                structured_order = self._wc_build_order_structure(order)
                structured_orders.append(structured_order)
        return {'orders': structured_orders}

    def _wc_build_order_structure(self, order, **kwargs):
        billing_address = order.get('billing')
        shipping_address = order.get('shipping')
        order_lines = order.get('line_items')
        return {
            'id': order.get('order_key'),
            'currency_code': order.get('currency'),
            'status': wc_utils.ORDER_STATUS_MAPPING[order.get('status')],
            'customer_id': order.get('customer_id'),
            'create_date': order.get('date_created', ''),
            'update_date': order.get('date_modified', ''),
            # 'fulfillment_type': 'FBMa',
            'shipping_price': order.get('shipping_total', ''),
            'shipping_tax_amount': order.get('shipping_tax', ''),
            # 'shipping_discount': order.get('', 0.0),
            # 'shipping_discount_tax': order.get(''),
            'order_lines': self._wc_prepare_order_line_data(order_lines),
            'billing_address': {
                    'name': f"{billing_address.get('first_name', '')} {billing_address.get('last_name', '')}".strip(),
                    'email': billing_address.get('email', ''),
                    'phone': billing_address.get('phone', ''),
                    'address_line_1': billing_address.get('address_1', ''),
                    'address_line_2': billing_address.get('address_2', ''),
                    'postal_code': billing_address.get('postcode', ''),
                    'city': billing_address.get('San Francisco', ''),
                    'state_code': billing_address.get('state', ''),
                    'country_code': billing_address.get('country', ''),
            }if billing_address else {},
            'shipping_address': {
                    'name': f"{shipping_address.get('first_name', '')} {shipping_address.get('last_name', '')}".strip(),
                    'email': shipping_address.get('email', ''),
                    'phone': shipping_address.get('phone', ''),
                    'address_line_1': shipping_address.get('address_1', ''),
                    'address_line_2': shipping_address.get('address_2', ''),
                    'postal_code': shipping_address.get('postcode', ''),
                    'city': shipping_address.get('San Francisco', ''),
                    'state_code': shipping_address.get('state', ''),
                    'country_code': shipping_address.get('country', ''),
            }if shipping_address else {},
            'other_address': [],
            'fulfillments': order.get('transaction_id') or False,
        }

    def _wc_prepare_order_line_data(self, order_lines):
        lines = []
        for line in order_lines:
            # If parent_id exists → it's a variation (child product).
            # If parent_id is 0/None → it's a template (parent product)
            identifier_type = 'product' if line.get('parent_name') else 'template'
            line_data = {
                'id': line.get('id'),
                'sku': line.get('sku') if line.get('sku') else None,
                'description': '',
                'name': line.get('name', ''),
                'product_id': line.get('variation_id'),
                'qty_ordered': line.get('quantity', 0),
                'price_unit': line.get('price', ''),
                'price_incl_tax': 0.0,
                'price_total': 0.0,
                'tax_amount': 0.0,
                'discount': 0.0,
                'discount_incl_tax': 0.0,
                'discount_tax': 0.0,
                'product_data': {
                    'name': line.get('name'),
                    'sku': line.get('sku'),
                    'mp_product_identifier': line.get('variation_id') if identifier_type == "product" else line.get('product_id'),
                    'mp_product_template_identifier': line.get('product_id') if identifier_type == "product" else None,
                    'identifier_type': identifier_type
                }
            }
            lines.append(line_data)
        return lines

    # Other methods
    def _ensure_account_is_authenticated(self):
        self.ensure_one()
        if self.channel_code != 'wc':
            return super()._ensure_account_is_authenticated()
        self._wc_check_credentials()
        return

    def _wc_check_credentials(self):
        self.ensure_one()
        if not self.wc_consumer_key:
            raise UserError(_("WooCommerce consumer key is required to make API calls."))
        if not self.wc_consumer_secret:
            raise UserError(_("WooCommerce consumer secret is required to make API calls."))
        if not self.wc_store_url:
            raise UserError(_("Please add your domain name"))

    def _wc_check_store_url(self):
        self.ensure_one()
        if not self.wc_store_url:
            raise UserError(_("Please add your store URL name"))
        response = wc_utils.call_wc(account=self, method='GET')
        if response:
            return response

    def _push_inventory_to_marketplace(self, inventory_data):
        if self.channel_code != 'wc':
            return super()._push_inventory_to_marketplace(inventory_data)
        updated_products = []
        failed_products = []
        for val in inventory_data:
            if val['offer'].identifier_type == 'template':
                route = f"products/{val['offer'].mp_product_identifier}"
            else:
                route = f"products/{val['offer'].mp_product_template_identifier}/variations/{val['offer'].mp_product_identifier}"
            try:
                product = wc_utils.call_wc(
                    account = self,
                    method = 'PUT',
                    route = route,
                    data = {
                        'manage_stock': True,
                        'stock_quantity': val.get('quantity', 0)
                    }
                )
                if not product:
                    logging.warning(f"Product {val['offer'].mp_product_identifier} quantity not updated")
                    failed_products.append(val['offer'].mp_product_identifier)
                    continue
                updated_products.append(val['offer'].mp_product_identifier)
            except Exception as error:
                return {'error': error}
        if failed_products:
            logging.warning(f"These products were not updated successfully: {failed_products}")
        else:
            logging.info(" All products updated successfully")
        return {'result': updated_products}

    # def _push_deliveries_to_marketplace(self, pickings):
    #     self.ensure_one()
    #     if self.channel_code != 'wc':
    #         return super()._push_deliveries_to_marketplace(pickings)
    #     updated_so = []
    #     failed_so = []
    #     for picking in pickings:
    #         if picking.sale_id.delivery_status == 'full':
    #             try:
    #                 response = wc_utils.call_wc(
    #                     account = self,
    #                     method = 'PUT',
    #                     route = f"orders/{picking.sale_id.id}", 
    #                     data = {
    #                         'status': 'completed'
    #                     }             
    #                 )
    #                 if not response:
    #                     logging.warning(f"Sale order {picking.sale_id.id} status not updated")
    #                     failed_so.append(picking.sale_id.id)
    #                     continue
    #                 updated_so.append(picking.sale_id.id)
    #             except Exception as error:
    #                 return {'error': ""}
    #     if failed_so:
    #         logging.warning(f"These products were not updated successfully: {failed_so}")
    #     else:
    #         logging.info(" All products updated successfully")
    #     return {'result': updated_so}

    def _get_product_url(self, offer):
        if self.channel_code != 'wc':
            return super()._get_product_url(offer)
        product_id = offer.mp_product_template_identifier if int(offer.mp_product_template_identifier) else offer.mp_product_identifier
        return f"{self.wc_store_url.replace('https://', 'http://')}/wp-admin/post.php?post={product_id}&action=edit"
