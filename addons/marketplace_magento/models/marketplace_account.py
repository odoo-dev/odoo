# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models
from odoo.exceptions import UserError

from ..utils import get_access_token_from_magento, call_magento
# TODO: implement MagentoClient for less repitition of code
# from .. import MagentoClient


ORDER_STATE_MAPPING = {
    "new": "confirmed",
    "holded": "confirmed",
    "processing": "confirmed",
    "complete": "confirmed",
    "canceled": "canceled",
}
ORDER_STATUS_MAPPING = {
    "pending": "confirmed",
    "holded": "confirmed",
    "processing": "confirmed",
    "complete": "confirmed",
    "fraud": "canceled",
    "canceled": "canceled",
}


class MarketplaceAccount(models.Model):
    _inherit = "marketplace.account"

    magento_base_url = fields.Char(
        string="Magento Base URL",
        required_if_channel="magento",
    )
    magento_username = fields.Char(
        string="Magento Username",
        required_if_channel="magento",
    )
    magento_password = fields.Char(
        string="Magento Password",
        required_if_channel="magento",
    )
    magento_access_token = fields.Char(
        string="Magento Access Token",
        # required_if_channel="magento",
    )
    # magento_website_code = fields.Char(
    #     string="Magento Website Code",
    #     help="Magento Website Code (e.g.: 'base'). Leave empty to fetch data of all the websites.",
    # )
    # magento_store_code = fields.Char(
    #     string="Magento Store Code",
    #     help="Magento Store Code (e.g.: 'main_website_store'). Leave empty to fetch data of all the stores.",
    # )
    magento_store_view_code = fields.Char(
        string="Magento Store View Code",
        help="Magento Store View Code (e.g.: 'default'). Leave empty to fetch data of all the store views.",
    )
    magento_website_id = fields.Integer(
        string="Magento Website ID",
        compute="_compute_magento_website_id_and_store_view_id",
        store=True,
    )
    # magento_store_id = fields.Integer(
    #     string="Magento Store ID",
    # )
    magento_store_view_id = fields.Integer(
        string="Magento Store View ID",
        compute="_compute_magento_website_id_and_store_view_id",
        store=True,
    )

    # @api.depends("magento_base_url", "magento_username", "magento_password", "magento_access_token")
    # def _compute_is_account_setup(self):
    #     """ Override of `marketplace` to check if credentials are set. """
    #     accounts = self.filtered(lambda acc: acc.channel_code == "magento")
    #     super(MarketplaceAccount, self - accounts)._compute_is_account_setup()
    #     for account in accounts:
    #         account.is_account_setup = bool(
    #             account.magento_base_url and
    #             ((account.magento_username and account.magento_password) or account.magento_access_token)
    #         )

    @api.depends("magento_store_view_code")
    def _compute_magento_website_id_and_store_view_id(self):
        for account in self:
            if not account.magento_store_view_code:
                account.magento_website_id = False
                account.magento_store_view_id = False
                continue
            # FIXME: is there no search filters on this route to filter by store view code???
            data = call_magento(account, "GET", "/store/storeViews")
            if isinstance(data, dict) and data.get("error"):
                raise UserError(self.env._("Error fetching store views from Magento: %s"), data["error"])
            account.magento_website_id, account.magento_store_view_id = next(
                ((store_view["website_id"], store_view["id"]) for store_view in data if store_view["code"] == account.magento_store_view_code),
                (False, False))
            if not account.magento_website_id or not account.magento_store_view_id:
                raise UserError(self.env._("Magento store view code '%s' not found. Please input a correct code.") % account.magento_store_view_code)

    def write(self, vals):
        res = super().write(vals)
        if any(field in vals for field in ["magento_base_url", "magento_username", "magento_password"]):
            for account in self.filtered(lambda acc: acc.channel_code == "magento"):
                account.action_disconnect()
        return res

    def action_connect(self):
        self.ensure_one()
        if self.channel_code == "magento":
            result = get_access_token_from_magento(
                self.magento_base_url,
                self.magento_username,
                self.magento_password,
            )
            if result.get("error"):
                raise UserError(self.env._("Failed to obtain access token from Magento: %s") % result["error"])
            self.magento_access_token = result.get("access_token")
        return super().action_connect()

    def _ensure_account_is_authenticated(self):
        self.ensure_one()
        res = super()._ensure_account_is_authenticated()
        if self.channel_code == "magento":
            if not self.magento_access_token or self.state == "disconnected":
                result = get_access_token_from_magento(
                    self.magento_base_url,
                    self.magento_username,
                    self.magento_password,
                )
                if result.get("error"):
                    raise UserError(self.env._("Failed to obtain access token from Magento: %s") % result["error"])
                self.magento_access_token = result.get("access_token")
        return res

    def _remove_the_credentials(self):
        self.ensure_one()
        if self.channel_code != "magento":
            return super()._remove_the_credentials()
        self.magento_access_token = False

    def _get_product_url(self, offer):
        if self.channel_code != "magento":
            return super()._get_product_url(offer)
        return f"{self.magento_base_url.rstrip('/')}/admin/catalog/product/edit/id/{offer.mp_product_identifier}/key/{self.magento_access_token}/" if offer and offer.mp_product_identifier else self.magento_base_url

    # TODO: what if you write magento API code here only???
    # def _magento_make_request(self, method, endpoint, params=None, payload=None):
    #     self.ensure_one()

    def _fetch_products_from_marketplace(self):
        self.ensure_one()
        if self.channel_code != "magento":
            return super()._fetch_products_from_marketplace()
        params = {
            # required param:
            "searchCriteria[currentPage]": 1,
            # "searchCriteria[pageSize]": 20,
            "searchCriteria[filterGroups][0][filters][0][field]": "updated_at",
            "searchCriteria[filterGroups][0][filters][0][conditionType]": "from",
            "searchCriteria[filterGroups][0][filters][0][value]": self.last_products_pull.strftime("%Y-%m-%dT%H:%M:%S"),
            "searchCriteria[filterGroups][1][filters][0][field]": "status",
            "searchCriteria[filterGroups][1][filters][0][conditionType]": "eq",
            "searchCriteria[filterGroups][1][filters][0][value]": "1",
        }
        # TODO: filter products by website
        # if self.magento_website_id:
        #     params["searchCriteria[filterGroups][2][filters][0][field]"] = "website_ids"
        #     params["searchCriteria[filterGroups][2][filters][0][conditionType]"] = "eq"
        #     params["searchCriteria[filterGroups][2][filters][0][value]"] = str(self.magento_website_id)
        data = call_magento(self, "GET", "/products", params)
        if data.get("error"):
            return data
            # raise UserError(self.env._("%s", data["message"]))
            # raise UserError(self.env._("Error fetching products from Magento: %s") % data["message"])
        magento_products = data.get("items", [])
        common_format = [{
            "name": product["name"],
            "sku": product["sku"],
            "mp_product_identifier": product["id"],
            # "price": product["price"],
        } for product in magento_products]
        return {
            "products": common_format,
        }

    def _fetch_locations_from_marketplace(self):
        self.ensure_one()
        if self.channel_code != "magento":
            return super()._fetch_locations_from_marketplace()
        params = {
            "searchCriteria[filterGroups][0][filters][0][field]": "enabled",
            "searchCriteria[filterGroups][0][filters][0][conditionType]": "eq",
            "searchCriteria[filterGroups][0][filters][0][value]": "1",
        }
        data = call_magento(self, "GET", "/inventory/sources", params)
        magento_locations = data.get("items", [])
        # what to do of the address info?
        return {
            "locations": [{
                "id": location.get("source_code"),
                "name": location.get("name"),
            } for location in magento_locations],
        }

    def _fetch_orders_from_marketplace(self):
        # self.ensure_one()
        if self.channel_code != "magento":
            # return
            return super()._fetch_orders_from_marketplace()
        params = {
            # "searchCriteria[currentPage]": 1,
            # "searchCriteria[pageSize]": 100,
            "searchCriteria[filterGroups][0][filters][0][field]": "updated_at",
            "searchCriteria[filterGroups][0][filters][0][conditionType]": "from",
            "searchCriteria[filterGroups][0][filters][0][value]": self.last_orders_pull.strftime("%Y-%m-%d %H:%M:%S"),
        }
        if self.magento_store_view_id:
            params["searchCriteria[filterGroups][1][filters][0][field]"] = "store_id"
            params["searchCriteria[filterGroups][1][filters][0][conditionType]"] = "eq"
            params["searchCriteria[filterGroups][1][filters][0][value]"] = str(self.magento_store_view_id)
        data = call_magento(self, "GET", "/orders", params)
        if data.get("error"):
            raise UserError(self.env._("Error fetching orders from Magento: %s") % data["message"])
        magento_orders = data.get("items", [])
        return {
            "orders": [
                self._magento_build_order_structure(order_data) for order_data in magento_orders
            ]
        }

    def _magento_build_order_structure(self, order_data):
        billing_address = order_data.get("billing_address") or {}
        shipping_address = order_data.get("extension_attributes", {}).get("shipping_assignments", [{}])[0].get("shipping", {}).get("address", {}) or {}
        order = {
            "id": order_data.get("entity_id"), # increment_id
            "status": ORDER_STATUS_MAPPING.get(order_data.get("status")),
            "create_date": order_data.get("created_at"),
            "update_date": order_data.get("updated_at"),
            "currency_code": order_data.get("order_currency_code"), # global_currency_code base_currency_code store_currency_code
            # "fulfillment_type": "FBMe" if order_data.get("extension_attributes", {}).get("shipping_assignments", [{}])[0].get("shipping", {}).get("method", "") == "flatrate_flatrate" else "FBMa",
            "fulfillment_type": "FBMe",
            "shipping_price": str(order_data.get("shipping_amount", 0)),
            "shipping_tax_amount": str(order_data.get("shipping_tax_amount", 0)),
            "shipping_discount": str(order_data.get("shipping_discount_amount", 0)),
            "shipping_discount_tax": str(order_data.get("shipping_discount_tax_compensation_amount", 0)),
            "customer_id": order_data.get("customer_id"),
            "billing_address": {
                "name": f"{billing_address.get('firstname', '')} {billing_address.get('lastname', '')}".strip(),
                "email": billing_address.get("email"),
                "phone": billing_address.get("telephone"),
                "address_line_1": billing_address.get("street", [""])[0],
                "address_line_2": billing_address.get("street")[1] if len(billing_address.get("street", [])) > 1 else "",
                "postal_code": billing_address.get("postcode"),
                "city": billing_address.get("city"),
                "state_name": billing_address.get("region"),
                "state_code": billing_address.get("region_code"),
                "country_code": billing_address.get("country_id"),
                "company_name": billing_address.get("company"),
            } if billing_address else None,
            "shipping_address": {
                "name": f"{shipping_address.get('firstname', '')} {shipping_address.get('lastname', '')}".strip(),
                "email": shipping_address.get("email"),
                "phone": shipping_address.get("telephone"),
                "address_line_1": shipping_address.get("street", [""])[0],
                "address_line_2": shipping_address.get("street")[1] if len(shipping_address.get("street", [])) > 1 else "",
                "postal_code": shipping_address.get("postcode"),
                "city": shipping_address.get("city"),
                "state_name": shipping_address.get("region"),
                "state_code": shipping_address.get("region_code"),
                "country_code": shipping_address.get("country_id"),
                "company_name": shipping_address.get("company"),
            } if shipping_address else None,
            "other_address": [],
            "order_lines": [{
                "id": item.get("item_id"),
                "product_data": {
                    "name": item.get("name"),
                    "sku": item.get("sku"),
                    "mp_product_identifier": item.get("product_id"),
                },
                "qty_ordered": item.get("qty_ordered"),
                "qty_canceled": item.get("qty_canceled"),
                "qty_invoiced": item.get("qty_invoiced"),
                "qty_refunded": item.get("qty_refunded"),
                # "qty_shipped": item.get("qty_shipped"),
                "qty_delivered": item.get("qty_delivered"),
                "price_subtotal": item.get("price"),
                "price_incl_tax": item.get("price_incl_tax"),
                "tax_amount": item.get("tax_amount"),
                "discount": item.get("discount_amount"),
                "package_id": None,
            } for item in order_data.get("items", [])],
            **self._fetch_fulfillments_from_marketplace(order_data.get("entity_id")),
        }
        return order

    def _fetch_fulfillments_from_marketplace(self, mp_order_identifier):
        self.ensure_one()
        if self.channel_code != "magento":
            return super()._fetch_fulfillments_from_marketplace(mp_order_identifier)
        params = {
            "searchCriteria[filterGroups][0][filters][0][field]": "order_id",
            "searchCriteria[filterGroups][0][filters][0][conditionType]": "eq",
            "searchCriteria[filterGroups][0][filters][0][value]": mp_order_identifier,
        }
        data = call_magento(self, "GET", "/shipments", params)
        if data.get("error"):
            raise UserError(self.env._("Error fetching shipments from Magento: %s") % data["message"])
        magento_shipments = data.get("items", [])
        return {
            "fulfillments": [
                self._magento_build_fulfillment_structure(shipment_data) for shipment_data in magento_shipments
            ]
        }

    def _magento_build_fulfillment_structure(self, fulfillment_data):
        # when getting shipments from order, get shipping_address like this:
        # shipping_address = fulfillment_data.get("shipping", {}).get("address", {}) or {}
        fulfillment = {
            "marketplace_picking_identifier": fulfillment_data.get("entity_id"),
            # TODO: mapper for status from magento to odoo???
            "status": fulfillment_data.get("shipment_status"),
            # "order_id": fulfillment_data.get("order_id"),
            "location_id": fulfillment_data.get("extension_attributes", {}).get("source_code"),
            # "shipping_address": same as order shipping address or we have to fetch according to shipping_address_id??? /V1/customers/addresses/{addressId}
            "line_items": [{
                "fulfillment_line_id": item.get("item_id"),
                "order_line_id": item.get("order_item_id"),
                "product_id": item.get("product_id"),
                "sku": item.get("sku"),
                "weight": item.get("weight"),
                "price": item.get("price"),
                "qty_shipped": item.get("qty"),
            } for item in fulfillment_data.get("items", []) if bool(item.get("qty"))],
            "carrier_id": (fulfillment_data.get("tracks") or [{}])[0].get("carrier_code"),
            "tracking_number": (fulfillment_data.get("tracks") or [{}])[0].get("track_number"),
        }
        return fulfillment

    def _push_inventory_to_marketplace(self, inventory_data):
        self.ensure_one()
        if self.channel_code != "magento":
            return super()._push_inventory_to_marketplace(inventory_data)
        payload = {
            "sourceItems": [{
                "sku": inventory.get("offer").sku,
                "source_code": inventory.get("location").marketplace_location_identifier,
                "quantity": int(inventory.get("quantity", 0)),
                "status": 1 if inventory.get("quantity", 0) > 0 else 0,
            } for inventory in inventory_data]
        }
        if not payload["sourceItems"]:
            return {"success": True, "message": "No inventory to update."}
        response = call_magento(self, "POST", "/inventory/source-items", payload=payload)
        if response and response.get("error"):
            return {"error": self.env._("Error pushing inventory to Magento: %s") % response["error"]}
        return {"success": True}

    def _push_deliveries_to_marketplace(self, pickings):
        self.ensure_one()
        if self.channel_code != "magento":
            return super()._push_deliveries_to_marketplace(pickings)
        for picking in pickings:
            shipment_items = []
            for move in picking.move_ids_without_package:
                if move.sale_line_id and move.sale_line_id.marketplace_line_identifier:
                    shipment_items.append({
                        "order_item_id": int(move.sale_line_id.marketplace_line_identifier),
                        "qty": int(move.quantity),
                    })
            if not shipment_items:
                continue
            tracks = []
            if picking.carrier_tracking_ref or True:
                tracks.append({
                    "order_id": int(picking.sale_id.marketplace_order_identifier),
                    "title": picking.carrier_id.name or "Custom Carrier",
                    "carrier_code": picking.carrier_id.name or "CustomCarrier",
                    "track_number": picking.carrier_tracking_ref,
                    "description": "Shipment Tracking",
                    "qty": sum(line["qty"] for line in shipment_items),
                    "weight": sum(move.product_id.weight * move.quantity for move in picking.move_ids_without_package),
                })
            comments = [{
                "comment": "Order shipped via Odoo",
                "is_customer_notified": 1,
                "is_visible_on_front": 1,
            }]
            payload = {
                "entity": {
                    "order_id": int(picking.sale_id.marketplace_order_identifier),
                    "items": shipment_items,
                    "tracks": tracks,
                    "comments": comments,
                    "extension_attributes": {
                        "source_code": self.env["marketplace.location"].search([
                            ("marketplace_account_id", "=", self.id),
                            ("matched_location_id", "=", picking.location_id.id)
                        ], limit=1).marketplace_location_identifier or None,
                    },
                }
            }
            response = call_magento(self, "POST", "/shipment", payload=payload)
            picking.marketplace_sync_status = "error" if response.get("error") else "done"
            # raise UserError(self.env._("Error pushing fulfillment to Magento: %s") % response["message"])
        return {"success": True}
