import logging
import psycopg2
from odoo import _, Command, api, fields, models

import dateutil.parser

from odoo import _, Command, api, fields, models, modules
from odoo.exceptions import AccessError, UserError, ValidationError


_logger = logging.getLogger(__name__)


class MarketplaceAccount(models.Model):
    _name = 'marketplace.account'
    _description = "Marketplace Account"
    _check_company_auto = True

    # FIXME: Currently we are not enabling Oauth flow due to unavailability of accurate credentials
    # so, we would have to enter the credentials of same account twice if we want to add multiple stores.
    # - Once we implement Oauth flow, there should be a Connect button on marketplace.channel and if
    # there are more than one shops/stores/marketplaces linked to one account we would create record
    # for each one of them to bring hierarchy at lowermost level.

    name = fields.Char(
        string="Name",
        required=True,
    )
    channel_code = fields.Char(
        related='marketplace_channel_id.code',
    )
    last_products_pull = fields.Datetime(
        string="Last Products Pull",
        help="The last time products were pulled from Marketplace.",
        default="1970-01-01",
    )
    # last_products_push = fields.Datetime(
    #     string="Last Products Push",
    #     help="The last time products were pushed to Marketplace.",
    #     default="1970-01-01",
    # )
    last_orders_pull = fields.Datetime(
        string="Last Orders Pull",
        help="The last time orders were pulled from Marketplace.",
        default="1970-01-01",
    )
    # last_deliveries_pull = fields.Datetime(
    #     string="Last Deliveries Pull",
    #     help="The last time deliveries were pulled from Marketplace.",
    #     default="1970-01-01",
    # )
    # last_deliveries_push = fields.Datetime(
    #     string="Last Deliveries Push",
    #     help="The last time deliveries were pushed to Marketplace.",
    #     default="1970-01-01",
    # )
    # last_inventory_push = fields.Datetime(
    #     string="Last Inventory Push",
    #     help="The last time inventory was pushed to Marketplace.",
    #     default="1970-01-01",
    # )
    last_location_pull = fields.Datetime(
        string="Last Locations Pull",
        help="The last time location was pulled from Marketplace.",
        default="1970-01-01",
    )
    # failed_order_identifiers = fields.Json(
    #     help="List of order identifiers that failed during processing.",
    # )
    push_inventory = fields.Boolean(
        string="Push Inventory",
    )

    state = fields.Selection(
        selection=[
            ("connected", "Connected"),
            ("disconnected", "Disconnected"),
        ],
        string="State",
        default="disconnected",
    )
    active = fields.Boolean(
        string="Active",
        help="If made inactive, this account will no longer be synchronized with Marketplace.",
        required=True,
        default=True,
    )

    offer_count = fields.Integer(string="Marketplace Offer Count", compute="_compute_offer_count")
    order_count = fields.Integer(string="Marketplace Order Count", compute="_compute_order_count")
    location_count = fields.Integer(string="Marketplace Location Count", compute="_compute_location_count")

    # pricelist_id ???
    team_id = fields.Many2one(
        comodel_name='crm.team',
        string="Sales Team"
    )
    user_id = fields.Many2one(
        comodel_name='res.users',
        string="Salesperson",
        default=lambda self: self.env.user
    )
    marketplace_channel_id = fields.Many2one(
        comodel_name="marketplace.channel",
        string="Marketplace Channel",
        required=True,
    )
    marketplace_offer_ids = fields.One2many(
        comodel_name='marketplace.offer',
        string="Marketplace Offers",
        inverse_name='marketplace_account_id',
        bypass_search_access=True
    )
    marketplace_location_ids = fields.One2many(
        comodel_name='marketplace.location',
        string="Marketplace Locations",
        inverse_name='marketplace_account_id',
        bypass_search_access=True
    )
    sale_order_ids = fields.One2many(
        comodel_name='sale.order',
        string="Sale Orders",
        inverse_name='marketplace_account_id'
    )
    # default_product_id = fields.Many2one(
    #     comodel_name='product.product',
    #     help="Product to use when product from marketplace is not found in offers.",
    #     required=True,
    # )
    default_marketplace_location_id = fields.Many2one(
        comodel_name='marketplace.location',
        string="Default Marketplace Location",
        help="Default marketplace location among all the locations linked with this account.",
        domain="[('id', 'in', marketplace_location_ids)]"
    )
    # FIXME: shouldn't this field be in particular marketplace module?
    # or a `_get_<field_name>_selection` method to add the selection dynamically according to each marketplace auth method?
    authorization_type = fields.Selection(
        selection=[
            ('oauth', "Oauth"),
            ('self_access', "Self Access"),
        ],
        string="Authorization Type",
        required=True,
        default='oauth',
        help="Select the authorization type to use for Flipkart API access.",
    )
    company_id = fields.Many2one(
        comodel_name="res.company",
        string="Company",
        required=True,
        default=lambda self: self.env.company,
        index=True,
    )

    # Change this after finding the correct approach
    support_location = fields.Boolean(
        related='marketplace_channel_id.support_location'
    )

    _unique_name = models.Constraint(
        "UNIQUE(company_id, name)",
        "The name must be unique within the same company",
    )

    #=== ORM METHODS ===#

    def _valid_field_parameter(self, field, name):
        return name == 'required_if_channel' or super()._valid_field_parameter(field, name)

    #=== COMPUTE METHODS ===#

    @api.depends('marketplace_offer_ids')
    def _compute_offer_count(self):
        # 1.
        offers_data = self.env['marketplace.offer']._read_group(
            domain=[('marketplace_account_id', 'in', self.ids)],
            groupby=['marketplace_account_id'],
            aggregates=['__count'],
        )
        offers_per_account = {account.id: count for account, count in offers_data}
        for account in self:
            account.offer_count = offers_per_account.get(account.id, 0)
        # 2.
        # for account in self:
        #     account.offer_count = len(account.marketplace_offer_ids)

    @api.depends('sale_order_ids')
    def _compute_order_count(self):
        # 1.
        orders_data = self.env['sale.order']._read_group(
            [('marketplace_account_id', 'in', self.ids)],
            groupby=['marketplace_account_id'],
            aggregates=['__count'],
        )
        orders_per_account = {account.id: count for account, count in orders_data}
        for account in self:
            account.order_count = orders_per_account.get(account.id, 0)
        # 2.
        # for account in self:
        #     account.order_count = len(account.sale_order_ids)

    @api.depends('marketplace_location_ids')
    def _compute_location_count(self):
        locations_data = self.env['marketplace.location']._read_group(
            [('marketplace_account_id', 'in', self.ids)],
            groupby=['marketplace_account_id'],
            aggregates=['__count'],
        )
        locations_per_account = {account.id: count for account, count in locations_data}
        for account in self:
            account.location_count = locations_per_account.get(account.id, 0)

    #=== CRUD METHODS ===#

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            # Create the sales team to be associated with this account if one isn't provided
            if not vals.get('team_id'):
                vals['team_id'] = self.env['crm.team'].create({
                    'name': "%s Team" % vals['name'],
                    'company_id': vals.get('company_id'),
                }).id
        accounts = super().create(vals_list)
        accounts._check_required_if_channel()
        for account in accounts:
            if not account.support_location:
                self.env['marketplace.location'].create({
                    'name': f"{account.name} location",
                    'marketplace_account_id': account.id,
                    'matched_location_id': self.env.ref('stock.stock_location_stock').id
                })
        return accounts

    def write(self, vals):
        if "marketplace_channel_id" in vals:
            raise UserError(_("You cannot change the Marketplace of an existing Marketplace Account."))
        result = super().write(vals)
        self._check_required_if_channel()
        return result

    #=== ACTION METHODS ===#

    def action_archive(self):
        """ Override to disconnect the Marketplace account before archiving it. """
        self.action_disconnect()
        return super().action_archive()

    # connect/link/authenticate to the marketplace
    def action_connect(self):
        self.ensure_one()
        self.state = 'connected'
        return True

    # disconnect/unlink/unauthenticate from the marketplace
    def action_disconnect(self):
        self.ensure_one()
        self._remove_the_credentials()
        self.state = 'disconnected'

    # action_fetch_products
    def action_pull_products(self):
        return self._pull_products()

    # action_create_or_update_products
    # def action_push_products(self):
    #     return self._push_products()

    # def action_sync_products(self):
    #     self.action_pull_products()
    #     self.action_push_products()
    #     return True

    # action_fetch_orders
    def action_pull_orders(self):
        return self._pull_orders()

    # pickings deliveries shipments packages fulfillments
    def action_push_deliveries(self):
        return self._push_deliveries()

    # fetch get
    def action_pull_locations(self):
        return self._pull_locations()

    # action_update_inventory
    def action_push_inventory(self):
        return self._push_inventory()

    def action_view_marketplace_offers(self):
        self.ensure_one()
        return {
            'name': "Offers",
            'type': 'ir.actions.act_window',
            'res_model': 'marketplace.offer',
            'view_mode': 'list',
            'domain': [('marketplace_account_id', '=', self.id)],
            'context': {'create': False,}
        }

    def action_view_marketplace_orders(self):
        self.ensure_one()
        return {
            'name': "Orders",
            'type': 'ir.actions.act_window',
            'res_model': 'sale.order',
            'view_mode': 'list,form',
            'domain': [('marketplace_account_id', '=', self.id)],
            'context': {'create': False,}
        }

    def action_view_marketplace_location(self):
        return {
            'name': "Locations",
            'type': 'ir.actions.act_window',
            'res_model': 'marketplace.location',
            'view_mode': 'list,form',
            'domain': [('marketplace_account_id', '=', self.id)],
            'context': {'create': False,}
        }

    #=== BUSINESS METHODS ===#

    def _check_required_if_channel(self):
        """ Check that channel-specific required fields have been filled.

        The fields that have the `required_if_channel='<channel_code>'` attribute are made
        required for all `marketplace.account` records with the `channel_code` field equal to
        `<channel_code>` and with the `state` field equal to `'connected'`.

        Channel-specific views should make the form fields required under the same conditions.

        :return: None
        :raise ValidationError: If a channel-specific required field is empty.
        """
        field_names = []
        for field_name, field in self._fields.items():
            required_for_channel_code = getattr(field, 'required_if_channel', None)
            if required_for_channel_code and any(
                required_for_channel_code == account.channel_code and not account[field_name]
                for account in self
            ):
                ir_field = self.env['ir.model.fields']._get(self._name, field_name)
                field_names.append(ir_field.field_description)
        if field_names:
            raise ValidationError(
                _("The following fields must be filled: %s", ", ".join(field_names))
            )

    def _ensure_account_is_authenticated(self):
        """
        Override this method in each marketplace integration to
        ensure that the marketplace account is authenticated and ready to use.
        """
        if self.state == "disconnected":
            raise UserError(_("The marketplace account is disconnected. Please connect it first."))
        return True

    # def _ensure_account_is_set_up_and_authenticated(self):
    #     self._check_required_fields_are_set()
    #     self._ensure_account_is_authenticated()
    #     return

    # or we can just override the action_disconnect method and call it's super
    def _remove_the_credentials(self):
        """ Override this method in each marketplace module to
        remove the credentials set on the marketplace account.
        """
        return True

    # should this be on marketplace.offer?
    def _get_product_url(self, offer):
        """ Override this method to return the marketplace's merchant portal product page URL.
        :rtype: str
        """
        return ''

    def _fetch_products_from_marketplace(self):
        """ Override this method in each marketplace module to
        fetch products from the marketplace and return them.

        This method should return a dictionary with the following structure:
        {
            "error": "Error message if any",
            "products": [{
                "sku": "Stock Keeping Unit",
                "name": "Name of Product in Marketplace",
                "mp_product_identifier": "Product/Offer ID in Marketplace",
                "mp_product_template_identifier": "Product Template ID in Marketplace",
                ...other marketplace-specific offer fields as needed
            },...],
        }

        :rtype: dict
        """
        return {}

    def _pull_products(self):
        pulled_products_count = 0
        for account in self:
            account._ensure_account_is_authenticated()
            result = account._fetch_products_from_marketplace()
            if result.get("error"):
                raise UserError(_("Error fetching products from Marketplace: %s") % result["error"])
            products_data = result.get("products", [])
            for product_data in products_data:
                pulled_products_count += 1
                try:
                    with self.env.cr.savepoint():
                        account._find_or_create_offer(product_data, auto_match=False)
                except (psycopg2.errors.NotNullViolation, ValueError, AccessError, ValidationError, UserError) as error:
                    _logger.warning(
                        "A business error occurred while processing the product data "
                        "with sku '%s' and mp_product_identifier '%s' for Marketplace account '%s'. "
                        "Skipping the product data and moving to the next product.",
                        product_data.get("sku"), product_data.get("mp_product_identifier"), account.name,
                        exc_info=True
                    )
                    account._handle_sync_failure(
                        flow="product_pull", data=product_data, error_messages=error
                    )
                    self.env.cr.rollback()
                    continue  # Skip this product data and resume with the next ones.
                self.env.cr.commit()
            account.last_products_pull = fields.Datetime.now()
        return {
            "type": "ir.actions.client",
            "tag": "display_notification",
            "params": {
                "type": "success",
                "message": _("Completed pulling %s products from %s Marketplace(s).", pulled_products_count, ",".join(self.mapped("name"))),
                "next": {"type": "ir.actions.act_window_close"},
            }
        }

    # def _push_products_to_marketplace(self, product_templates):
    #     """ Override this method in marketplace module to
    #     push products to the marketplace and return the result in common format.

    #     :rtype: dict
    #     """
    #     return {}

    # def _push_products(self):
    #     for account in self:
    #         account._ensure_account_is_authenticated()
    #         products = self.env["product.template"].search([
    #             ("write_date", ">=", account.last_products_push),
    #         ])
    #         if not products:
    #             _logger.info("No new products found for account: %s", account.name)
    #             continue
    #         pushed_products = []
    #         result = account._push_products_to_marketplace(products)
    #         if not result:
    #             raise UserWarning(_("No response received from marketplace while pushing products."))
    #         if result.get('error'):
    #             raise UserError(_("Error occurred while pushing products to marketplace: %s") % result['error'])
    #         pushed_products.append(result)
    #         unsynced_products = set(products) - set(pushed_products)
    #         _logger.info(
    #             "Item sync completed for account: %s\nSynced: %s\nUnsynced: %s",
    #             account.name,
    #             pushed_products,
    #             unsynced_products
    #         )
    #         if not unsynced_products:
    #             _logger.info("All products pushed successfully for account: %s", account.name)
    #         else:
    #             _logger.warning("Some products failed to push for account: %s", account.name)
    #         account.last_products_push = fields.Datetime.now()
    #     return {
    #         'type': 'ir.actions.client',
    #         'tag': 'display_notification',
    #         'params': {
    #             'type': 'success',
    #             'message': _("Products have been processed for marketplace sync. Check logs for detailed results."),
    #             'next': {'type': 'ir.actions.act_window_close'},
    #         }
    #     }

    def _fetch_locations_from_marketplace(self):
        """ Override this method in marketplace module to
        fetch locations from the marketplace and return them.

        :rtype: dict
        """
        return {}

    def _pull_locations(self):
        for account in self:
            account._ensure_account_is_authenticated()
            result = account._fetch_locations_from_marketplace()
            # call the respective api to pull a location and return the result in common format.
            if result.get("error"):
                raise UserError(_(f"Error during fetching locations from Marketplace: {result.get('error', '')}"))
            locations = result.get("locations", [])
            for location in locations:
                account._find_or_create_location(
                    location["id"], location["name"],
                )
            account.last_location_pull = fields.Datetime.now()
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'type': 'success',
                'message': _("Locations are pulled successfully from %s Marketplace(s).", ",".join(self.mapped("name"))),
                'next': {'type': 'ir.actions.act_window_close'},
            }
        }

    def _find_or_create_location(self, identifier, name):
        self.ensure_one()
        location = self.marketplace_location_ids.filtered(
            lambda location: location.marketplace_location_identifier == str(identifier))
        if location and location.name != name:
            location.name = name
        elif not location:
            location = self.env["marketplace.location"].create({
                "name": name,
                "marketplace_location_identifier": identifier,
                "marketplace_account_id": self.id,
            })
        return location

    def _pull_orders(self):
        orders_received = 0
        orders_success = 0
        failed_orders = []
        for account in self:
            account._ensure_account_is_authenticated()
            result = account._fetch_orders_from_marketplace()
            if result.get("error"):
                raise UserError(_("Error fetching orders from Marketplace: %s") % result["error"])
            orders_data = result.get("orders", []) or []
            orders_received += len(orders_data)
            for order_data in orders_data:
                try:
                    with self.env.cr.savepoint():
                        account._process_order_data(order_data)
                        orders_success += 1
                except (ValueError, AccessError, UserError, ValidationError) as error:
                    if modules.module.current_test:
                        # we are executing during testing, do not try to rollback
                        raise
                    _logger.warning(
                        "A business error occurred while processing the order data "
                        "with mp_order_identifier '%s' for Marketplace account with id '%s'. "
                        "Skipping the order data and moving to the next order.",
                        order_data["id"], account.id,
                        exc_info=True
                    )
                    # Dismiss business errors to allow the synchronization to skip the
                    # problematic orders and require synchronizing them manually.
                    self.env.cr.rollback()
                    account._handle_sync_failure(
                        flow="order_pull", data={'mp_order_ref': order_data['id']}, error_messages=error
                    )
                    failed_orders.append(order_data["id"])
                    continue  # Skip these order data and resume with the next ones.
                self.env.cr.commit()  # Commit to mitigate an eventual cron kill.
            # There are no more orders to pull and the synchronization went through. Set the API
            # upper limit on order status update to be the last synchronization date of the account.
            account.last_orders_pull = fields.Datetime.now()
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'type': 'warning' if failed_orders else 'success',
                'title': _("Order Pull Summary"),
                'message': self.env._("Orders received: %s | Orders processed: %s | Orders failed: %s",
                    orders_received, orders_success, len(failed_orders)),
                'next': {'type': 'ir.actions.act_window_close'},
            }
        }

    def _process_order_data(self, order_data):
        """ Process the provided order data and return the matching sales order, if any.

        If no matching sales order is found, a new one is created if it is in a 'synchronizable'
        status: 'Shipped' or 'Unshipped', if it is respectively an FBA or an FBA order. If the
        matching sales order already exists and the Marketplace order was canceled, the sales order is
        also canceled. If the matching sales order already exists and the order data confirm that a
        FBM order got shipped, we update the shipping status when it's needed.

        Note: self.ensure_one()

        :param dict order_data: The order data to process.
        :return: The matching marketplace order, if any, as a `sale.order` record.
        :rtype: recordset of `sale.order`
        """
        self.ensure_one()
        marketplace_order_identifier = order_data["id"]
        order = self.sale_order_ids.filtered(lambda order:
            order.marketplace_order_identifier == str(marketplace_order_identifier))
        # order = self.env["sale.order"].search([
        #     ("marketplace_account_id", "=", self.id),
        #     ("marketplace_order_identifier", "=", marketplace_order_identifier),
        # ], limit=1)
        status = order_data["status"]
        fulfillment_type = order_data.get("fulfillment_type") or "FBMe"
        fulfillments = order_data.get("fulfillments")
        if not order:  # No sales order was found with the given marketplace order reference.
            if status == "confirmed":
                # Create the sales order and generate stock moves depending on the fulfillment type.
                order = self._create_order_from_data(order_data)
                if fulfillment_type == "FBMa":
                    location_id = self._get_order_location(order_data).id
                    self._generate_stock_moves(order, location_id)
                else:
                    order.with_context(mail_notrack=True).action_lock()
                    if fulfillments:
                        self._validate_marketplace_order_delivery(order, order_data)
                _logger.info(
                    "Created a new sales order with order reference %(ref)s for %(code)s account"
                    " with id %(id)s.", {"ref": marketplace_order_identifier, "code": self.channel_code, "id": self.id}
                )
            else:
                _logger.info(
                    "Ignored Marketplace order with reference %(ref)s and status %(status)s for Marketplace"
                    " account with id %(account_id)s.",
                    {"ref": marketplace_order_identifier, "status": status, "account_id": self.id},
                )
        else:  # The sales order already exists
            if fulfillments:
                self._validate_marketplace_order_delivery(order, order_data)
            unsynced_pickings = order.picking_ids.filtered(
                lambda picking: picking.marketplace_sync_status != "done" and picking.state != "cancel"
            )  # Consider any "unsynced" status so that we synchronize updates made from Marketplace.
            if status == "canceled" and order.state != "cancel":
                order._action_cancel()
                # TODO should we also cancel/return the stock moves?
                _logger.info(
                    "Cancelled sales order with order reference %(ref)s for %(code)s account with id"
                    " %(id)s.", {"ref": marketplace_order_identifier, "code": self.channel_code, "id": self.id}
                )
            elif status == "shipped" and fulfillment_type == "FBMe" and unsynced_pickings:
                # This can happen in 3 cases:
                # 1. The processing of the feed of a batch of pickings failed on marketplace side in a
                # way that we couldn't tell which picking are faulty. In that case, all pickings of
                # the batch were flagged as in error. The order status update allows correcting the
                # status of non-faulty pickings while leaving the faulty ones in error.
                # 2. The shipping was arranged directly from marketplace's backend.
                # 3. The user uses a delivery method that contacted marketplace to send the picking
                # information before we did.
                unsynced_pickings.marketplace_sync_status = "done"
                _logger.info(
                    "Forced the picking synchronization status to 'done' for sales order with"
                    " order reference %(ref)s and marketplace account with id %(id)s.",
                    {"ref": marketplace_order_identifier, "id": self.id},
                )
            else:
                _logger.info(
                    "Ignored already synchronized sales order with order reference %(ref)s for"
                    " marketplace account with id %(id)s.", {"ref": marketplace_order_identifier, "id": self.id}
                )
        if (fulfillment_type == "FBMa" and order.picking_ids) or (fulfillment_type == "FBMe" and order_data.get("fulfillments")):
            order._marketplace_create_activity_resolve_fulfillment_conflict(self.user_id.id, fulfillment_type)
        return order

    def _validate_marketplace_order_delivery(self, order, order_data):
        """ Validate and process marketplace order deliveries.
        :param order: Sale order record
        :param fulfillments: List of fulfillment data dicts
        """
        fulfillments = order_data.get("fulfillments")
        for fulfillment in fulfillments:
            marketplace_picking_identifier = str(fulfillment.get('marketplace_picking_identifier'))
            existing_picking = order.picking_ids.filtered(
                lambda p: p.marketplace_picking_identifier == marketplace_picking_identifier
            )
            if not existing_picking:
                line_items = fulfillment.get('line_items', [])
                so_line_id = [str(line_item.get('marketplace_line_identifier')) for line_item in line_items]
                picking_id = order.picking_ids.filtered(lambda p: p.state != "done")
                shipping_code = fulfillment.get('carrier_id')
                tracking_ref = fulfillment.get('tracking_number')

                if not tracking_ref:
                    raise UserError(_("Please add Shipping Code and Tracking Reference"))

                shipping_product = self._find_matching_product(
                    shipping_code, 'omnicommerce_default_shipping', 'Shipping', 'service'
                )
                contact_partner, delivery_partner = self._find_or_create_partners_from_data(order_data)
                mp_location_id = fulfillment.get('location_id', '')
                internal_location= self._find_or_create_location(mp_location_id) if mp_location_id else self._get_order_location(order_data)
                picking_id.write({
                    'partner_id': delivery_partner,
                    'carrier_id': self._find_or_create_delivery_carrier(shipping_code, shipping_product).id,
                    'carrier_tracking_ref': tracking_ref,
                    'location_id': internal_location.id
                })
                lines = order.order_line.filtered(lambda line: line.marketplace_line_identifier in so_line_id)
                for line in lines:
                    line.move_ids.picked = True
                picking_id.with_context(cancel_backorder=False)._action_done()
                picking_id.marketplace_picking_identifier = marketplace_picking_identifier
                picking_id.marketplace_sync_status = "done"

    def _find_or_create_delivery_carrier(self, shipping_code, shipping_product):
        """ Find or create a delivery carrier based on the shipping code.

        :param str shipping_code: The shipping code.
        :param record shipping_product: The shipping product matching the shipping code, as a
                                        `product.product` record.
        :return: The delivery carrier.
        :rtype: delivery.carrier
        """
        shipping_code = shipping_code.strip()
        delivery_method = self.env['delivery.carrier'].search(
            [('name', '=', shipping_code)], limit=1,
        )
        if not delivery_method:
            delivery_method = self.env['delivery.carrier'].create({
                'name': shipping_code, 'product_id': shipping_product.id
            })
        return delivery_method

    def _create_order_from_data(self, order_data):
        """ Create a new sales order based on the provided order data.

        Note: self.ensure_one()

        :param dict order_data: The order data to create a sales order from.
        :return: The newly created sales order.
        :rtype: record of `sale.order`
        """
        self.ensure_one()
        order_vals = self._prepare_order_values(order_data)
        return self.env["sale.order"].with_context(
            mail_create_nosubscribe=True
        ).with_company(self.company_id).create(order_vals)

    def _prepare_order_values(self, order_data):
        # Prepare the order line values.
        shipping_code = order_data.get('shipping_code') if order_data.get('shipping_code') else f"shipping_code_{order_data.get('id')}"
        shipping_product = self._find_matching_product(
            shipping_code, 'omnicommerce_default_shipping', 'Shipping', 'service'
        )
        marketplace_order_identifier = order_data["id"]
        currency_code = order_data.get('currency_code')
        if currency_code:
            currency = self.env['res.currency'].with_context(active_test=False).search(
                [('name', '=', currency_code)], limit=1
            )
        else:
            raise ValidationError(_(
                "The Marketplace order with reference %(ref)s was not recovered because its currency"
                " was missing from the Marketplace order data.",
                ref=marketplace_order_identifier,
            ))
        fulfillment_type = order_data.get("fulfillment_type")
        contact_partner = self.env["res.partner"]
        delivery_partner = self.env["res.partner"]
        # Check if billing and shipping addresses are present and at least one of there attribute is filled
        billing_address_is_present = order_data.get("billing_address") and any(order_data.get("billing_address").values())
        shipping_address_is_present = order_data.get("shipping_address") and any(order_data.get("shipping_address").values())
        if not billing_address_is_present and not shipping_address_is_present:
            default_partner = self.env.ref("marketplace_default_customer", raise_if_not_found=False)
            if not default_partner:  # Restore the default partner if it was deleted
                default_partner = self.env['res.partner']._restore_data_partner(
                    "Marketplace Default Customer", "marketplace_default_customer"
            )
            delivery_partner = contact_partner = default_partner
        else:
            contact_partner, delivery_partner = self._find_or_create_partners_from_data(order_data)

            # if partners have no state, despite receiving state code
            # and fullfillment of order is to be done by merchant,
            # then create an activity to set state
            state_code = order_data.get("billing_address", {}).get("state_code")
            if contact_partner and fulfillment_type == "FBMe" and state_code and not contact_partner.state_id:
                contact_partner._marketplace_create_activity_set_state(self.user_id.id, state_code)
            state_code = order_data.get("shipping_address", {}).get("state_code")
            if delivery_partner and fulfillment_type == "FBMe" and state_code and not delivery_partner.state_id:
                delivery_partner._marketplace_create_activity_set_state(self.user_id.id, state_code)

        fiscal_position = self.env["account.fiscal.position"].with_company(
            self.company_id
        )._get_fiscal_position(contact_partner, delivery_partner)
        order_lines_values = self._prepare_order_lines_values(
            order_data, currency, fiscal_position, shipping_product
        )
        order_vals = {
            "origin": f"Marketplace Order # {marketplace_order_identifier}",
            "state": "sale",
            # The order is first created unlocked and later locked to trigger the creation of a
            # stock picking if fulfilled by merchant.
            "locked": fulfillment_type == "FBMa",
            "date_order": dateutil.parser.parse(order_data["create_date"]).replace(tzinfo=None),
            "partner_id": contact_partner.id,
            "pricelist_id": self._find_or_create_pricelist(currency).id,
            "order_line": [Command.create(order_line_values) for order_line_values in order_lines_values],
            "invoice_status": "no",
            "partner_shipping_id": delivery_partner.id,
            "require_signature": False,
            "require_payment": False,
            "fiscal_position_id": fiscal_position.id,
            "company_id": self.company_id.id,
            "user_id": self.user_id.id,
            "team_id": self.team_id.id,
            "marketplace_order_identifier": marketplace_order_identifier,
            "fulfillment_type": fulfillment_type if fulfillment_type else 'FBMe',
            "marketplace_account_id": self.id,
        }
        order_vals["warehouse_id"] = self._get_order_location(order_data).warehouse_id.id
        return order_vals

    def _get_order_location(self, order_data):
        """ Get location based on the provided order_data

        :param dict order_data: The order data related to the item data.
        :return: Stock Location
        :rtype: record of `stock.location`
        """
        if not self.marketplace_channel_id.support_location:
            self.marketplace_location_ids.ensure_one()
            if not self.marketplace_location_ids.matched_location_id:
                raise ValidationError(_(
                    "The Marketplace order with reference %(ref)s was not able to process "
                    "because the location with reference %(loc)s is not mapped to any odoo location.",
                    ref=order_data.get('id'),
                    loc=self.marketplace_location_ids,
                ))
            return self.marketplace_location_ids.matched_location_id
        location_identifier = order_data.get('location_id')
        if not location_identifier:
            location_identifier = self.default_marketplace_location_id.marketplace_location_identifier
        if not location_identifier:
            raise ValidationError(_(
                "The Marketplace order with reference %(ref)s was not able to process "
                "because its location was missing from the Marketplace order data.",
                ref=order_data.get('id')
            ))
        # FIXME: mp account domain in search:
        marketplace_location_id = self.env['marketplace.location'].search([
            ('marketplace_account_id', '=', self.id),
            ('marketplace_location_identifier', '=', str(location_identifier))
        ])
        if not marketplace_location_id or not marketplace_location_id.matched_location_id:
            raise ValidationError(_(
                "The Marketplace order with reference %(ref)s was not able to process "
                "because the location with reference %(loc)s is not mapped to any odoo location.",
                ref=order_data.get('id'), 
                loc=location_identifier,
            ))
        return marketplace_location_id.matched_location_id

    def _find_or_create_partner(self, address_data, address_type):
        """ Find or create a partner based on the provided address data.

        Note: self.ensure_one()

        :param dict address_data: The address data to find or create the partner from.
        :param str address_type: The type of the partner - 'contact', 'invoice', 'delivery', 'other'.
        :return: The found or created partner as a `res.partner` record.
        :rtype: recordset of `res.partner`
        """
        self.ensure_one()

        name = address_data.get("name")
        email = address_data.get("email")
        phone = address_data.get("phone")
        address_line1 = address_data.get("address_line_1")
        address_line2 = address_data.get("address_line_2")
        zip_code = address_data.get("postal_code")
        city = address_data.get("city")
        state_code = address_data.get("state_code")
        country_code = address_data.get("country_code")
        country = self.env["res.country"].search([
            ("code", "=", country_code)
        ], limit=1)
        state = self.env["res.country.state"].search([
            ("country_id", "=", country.id),
            "|", ("code", "=ilike", state_code), ("name", "=ilike", state_code),
        ], limit=1)

        partner_vals = {
            "name": name or f"Marketplace Customer # {address_data.get('customer_id')}",
            "email": email,
            "phone": phone,
            "street": address_line1,
            "street2": address_line2,
            "zip": zip_code,
            "city": city,
            "state_id": state.id,
            "country_id": country.id,
            "company_id": self.company_id.id,
            "customer_rank": 1,
            "is_company": bool(address_type == 'invoice' and address_data.get('company_name')),
        }

        # Search for an existing contact partner based on the personal information and email.
        partner = self.env["res.partner"].search([
            *self.env["res.partner"]._check_company_domain(self.company_id),
            ("name", "=", name),
            ("email", "=", email),
        ], limit=1) if email else None
        if partner and not (
            partner.phone == phone
            and partner.street == address_line1
            and (not partner.street2 or partner.street2 == address_line2)
            and partner.zip == zip_code
            and partner.city == city
            and partner.state_id.id == state.id
            and partner.country_id.id == country.id
        ):
            partner = self.env["res.partner"].with_context(tracking_disable=True).create({
                **partner_vals,
                "type": address_type,
                "parent_id": partner.id,
            })
        if not partner:
            partner = self.env["res.partner"].with_context(tracking_disable=True).create(partner_vals)
        return partner

    def _find_or_create_partners_from_data(self, customer_data):
        """ Find or create the contact and delivery partners based on the provided customer data.

        Note: self.ensure_one()

        :param dict customer_data: The customer data to find or create the partners from.
        :return: The contact and delivery partners, as `res.partner` records. When the contact
                 partner acts as delivery partner, the records are the same.
        :rtype: tuple[recordset of `res.partner`, recordset of `res.partner`]
        """
        self.ensure_one()
        billing_address = customer_data.get("billing_address") or customer_data.get("shipping_address")
        order_partner = self._find_or_create_partner(billing_address, "invoice")

        # The contact partner is searched based on all the personal information and only if the
        # Marketplace email is provided. A match thus only occurs if the customer had already made a
        # previous order and if the personal information provided by the API did not change in the
        # meantime. If there is no match, a new contact partner is created. This behavior is
        # preferred over updating the personal information with new values because it allows using
        # the correct contact details when invoicing the customer for an earlier order, should there
        # be a change in the personal information.

        shipping_address = customer_data.get("shipping_address") or billing_address
        picking_partner = self._find_or_create_partner(shipping_address, "delivery")
        # other_addresses = customer_data.get("other_addresses")
        return order_partner, picking_partner

    def _prepare_order_lines_values(self, order_data, currency, fiscal_pos, shipping_product):
        """ Prepare the values for the order lines to create based on Marketplace data.

        Note: self.ensure_one()

        :param dict order_data: The order data related to the item data.
        :param record currency: The currency of the sales order, as a `res.currency` record.
        :param record fiscal_pos: The fiscal position of the sales order, as an
                                  `account.fiscal.position` record.
        :param record shipping_product: The shipping product matching the shipping code, as a
                                        `product.product` record.
        :return: The order lines values.
        :rtype: dict
        """
        self.ensure_one()
        order_lines_values = []
        lines_data = order_data.get("order_lines")
        for line_data in lines_data:
            # Prepare the values for the product line.
            offer = self._find_or_create_offer(line_data.get('product_data'))
            product_taxes = offer.matched_product_id.taxes_id.filtered_domain(
                [*self.env["account.tax"]._check_company_domain(self.company_id)]
            )
            description = _("%s") % line_data.get("description", '')
            # uom = line_data.get("uom", False)
            price_unit = float(line_data.get("price_unit", 0.0))
            price_subtotal = float(line_data.get("price_subtotal", 0.0) or 0.0)
            price_total = line_data.get("price_total", False)
            tax_amount = float(line_data.get("tax_amount", 0.0))
            taxes = fiscal_pos.map_tax(product_taxes) if fiscal_pos else product_taxes
            subtotal = self._recompute_subtotal(
                price_subtotal, tax_amount, taxes, currency, fiscal_pos
            )
            promo_discount = float(line_data.get('discount_amount', 0))
            discount_incl_tax = line_data.get('discount_incl_tax', False)
            promo_disc_tax = float(line_data.get('discount_tax', 0))
            original_promo_discount_subtotal = promo_discount
            promo_discount_subtotal = self._recompute_subtotal(
                original_promo_discount_subtotal, promo_disc_tax, taxes, currency, fiscal_pos
            )
            marketplace_line_identifier = line_data['id']
            order_lines_values.append(self._convert_to_order_line_values(
                line_data=line_data,
                product_id=offer.matched_product_id.id,
                description=description,
                quantity=line_data["qty_ordered"],
                price_unit=price_unit,
                discount=promo_discount_subtotal,
                subtotal=subtotal,
                tax_ids=taxes.ids,
                marketplace_offer_id=offer.id,
                marketplace_line_identifier=marketplace_line_identifier,
            ))

            # Prepare the values for the delivery charges.
            # shipping_code = order_data.get("shipping_code", "")
            # shipping_price = float(line_data.get("shipping_price", 0.0))
            # if shipping_code and shipping_price != 0:
            #     shipping_product_taxes = shipping_product.taxes_id.filtered_domain(
            #         [*self.env['account.tax']._check_company_domain(self.company_id)]
            #     )
            #     shipping_taxes = fiscal_pos.map_tax(shipping_product_taxes) if fiscal_pos \
            #         else shipping_product_taxes
            #     shipping_tax_amount = float(line_data.get("shipping_tax", 0.0))
            #     origin_ship_subtotal = shipping_price
            #     shipping_subtotal = self._recompute_subtotal(
            #         origin_ship_subtotal, shipping_tax_amount, shipping_taxes, currency, fiscal_pos
            #     )
            #     ship_discount = float(line_data.get('shipping_discount', 0.0))
            #     ship_disc_tax = float(line_data.get('shipping_discount_tax', 0.0))
            #     origin_ship_disc_subtotal = ship_discount
            #     ship_discount_subtotal = self._recompute_subtotal(
            #         origin_ship_disc_subtotal, ship_disc_tax, shipping_taxes, currency, fiscal_pos
            #     )
            #     order_lines_values.append(self._convert_to_order_line_values(
            #         line_data=line_data,
            #         product_id=shipping_product.id,
            #         description=_(
            #             "[%(shipping_code)s] Delivery Charges for %(product)s",
            #             shipping_code=shipping_code, product=offer.matched_product_id.name,
            #         ),
            #         subtotal=shipping_subtotal,
            #         tax_ids=shipping_taxes.ids,
            #         discount=ship_discount_subtotal,
            #     ))
        return order_lines_values

    @api.model
    def _convert_to_order_line_values(self, **kwargs):
        """ Convert and complete a dict of values to comply with fields of `sale.order.line`.

        :param dict kwargs: The values to convert and complete.
        :return: The completed values.
        :rtype: dict
        """
        subtotal = kwargs.get("subtotal", 0)
        quantity = kwargs.get("quantity", 1)
        return {
            "name": kwargs.get("description", ""),
            "product_id": kwargs.get("product_id"),
            "price_unit": kwargs.get("price_unit", (subtotal / quantity) if quantity else 0),
            "product_uom_qty": quantity,
            "discount": (kwargs.get("discount", 0) / subtotal) * 100 if subtotal else 0,
            "tax_ids": [Command.link(tax_id) for tax_id in kwargs.get("tax_ids", [])],
            "display_type": kwargs.get("display_type", False),
            "marketplace_offer_id": int(kwargs.get("marketplace_offer_id")),
            "marketplace_line_identifier": kwargs.get("marketplace_line_identifier"),
        }

    def _find_or_create_offer(self, product_data, auto_match=True):
        """ Find & update or create the marketplace offer based on the product/listing/offer sku.

        Note: self.ensure_one()

        :param dict product_data: The product data to find & update or create the offer from.
        :param bool auto_match: Whether to automatically match the product based on SKU.
        :return: The marketplace offer.
        :rtype: recordset of `marketplace.offer`
        """
        self.ensure_one()

        offer = self.marketplace_offer_ids.filtered(lambda offer: offer.sku == product_data.get("sku"))
        # offer = self.env['marketplace.offer'].search([
        #     ('marketplace_account_id', '=', self.id),
        #     ('sku', '=', product_data.get('sku')),
        # ], limit=1)
        if offer:
            offer.write(product_data)
        else:
            offer = self.env["marketplace.offer"].with_context(tracking_disable=True).create({
                **product_data,
                "marketplace_account_id": self.id,
                "matched_product_id": self._find_matching_product(
                    product_data['sku'] if auto_match else None, "marketplace_default_product", "Marketplace Sales", "consu"
                ).id,
            })
        return offer

    def _find_or_create_pricelist(self, currency):
        """ Find or create the pricelist based on the currency.

        Note: self.ensure_one()

        :param recordset currency: The currency of the pricelist, as a `res.currency` record.
        :return: The pricelist.
        :rtype: recordset of `product.pricelist`
        """
        self.ensure_one()
        pricelist = self.env['product.pricelist'].with_context(active_test=False).search([
            *self.env['product.pricelist']._check_company_domain(self.company_id),
            ('currency_id', '=', currency.id),
        ], limit=1)
        if not pricelist:
            pricelist = self.env['product.pricelist'].with_context(tracking_disable=True).create({
                'name': 'Marketplace Pricelist %s' % currency.name,
                'active': False,
                'currency_id': currency.id,
                'company_id': self.company_id.id,
            })
        return pricelist

    def _find_matching_product(
        self, internal_reference, default_xmlid, default_name, default_type, fallback=True
    ):
        """ Find the matching product for a given internal reference.

        If no product is found for the given internal reference, we fall back on the default
        product. If the default product was deleted, we restore it.

        Note: self.ensure_one()

        :param str internal_reference: The internal reference of the product to be searched.
        :param str default_xmlid: The xmlid of the default product to use as fallback.
        :param str default_name: The name of the default product to use as fallback.
        :param str default_type: The product type of the default product to use as fallback.
        :param bool fallback: Whether we should fall back to the default product when no product
                              matching the provided internal reference is found.
        :return: The matching product.
        :rtype: recordset of `product.product`
        """
        self.ensure_one()
        product = self.env['product.product'].search([
            *self.env['product.product']._check_company_domain(self.company_id),
            ('default_code', '=', internal_reference),
        ], limit=1) if internal_reference else self.env['product.product']
        if not product and fallback:  # Fallback to the default product
            product = self.env.ref('marketplace.%s' % default_xmlid, raise_if_not_found=False)
        if not product and fallback:  # Restore the default product if it was deleted
            product = self.env['product.product']._restore_data_product(
                default_name, default_type, default_xmlid
            )
        return product

    @api.model
    def _recompute_subtotal(self, subtotal, tax_amount, taxes, currency, _fiscal_pos=None):
        """ Recompute the subtotal from the tax amount and the taxes.

        As it is not always possible to find the right tax record for a tax rate computed from the
        tax amount because of rounding errors or because of multiple taxes for a given rate, the
        taxes on the product (or those given by the fiscal position) are used instead.

        To achieve this, the subtotal is recomputed from the taxes for the total to match that of
        the order in SellerCentral. If the taxes used are not identical to that used by Marketplace, the
        recomputed subtotal will differ from the original subtotal.

        :param float subtotal: The original subtotal to use for the computation of the base total.
        :param float tax_amount: The original tax amount to use for the computation of the base
                                 total.
        :param recordset taxes: The final taxes to use for the computation of the new subtotal, as
                                an `account.tax` recordset.
        :param recordset currency: The currency used by the rounding methods, as a `res.currency`
                                   record.
        :param recordset _fiscal_pos: The fiscal position only used in overrides of this method, as
                                      an `account.fiscal.position` recordset.
        :return: The new subtotal.
        :rtype: float
        """
        total = subtotal + tax_amount
        taxes_res = taxes.with_context(force_price_include=True).compute_all(
            total, currency=currency
        )
        subtotal = taxes_res['total_excluded']
        for tax_res in taxes_res['taxes']:
            tax = self.env['account.tax'].browse(tax_res['id'])
            if tax.price_include:
                subtotal += tax_res['amount']
        return subtotal

    def _generate_stock_moves(self, order, location_id):
        """ Generate a stock move for each product of the provided sales order.

        :param recordset order: The sales order to generate the stock moves for, as a `sale.order`
                                record.
        :return: The generated stock moves.
        :rtype: recordset of `stock.move`
        """
        self.ensure_one()
        customers_location = self.env.ref("stock.stock_location_customers")
        stock_moves = self.env['stock.move']
        # TODO what about combo products? what about goods product with tracking by lot/serial number?
        for order_line in order.order_line.filtered(
            lambda l: l.product_id.type != "service" and not l.display_type
        ):
            stock_move = self.env["stock.move"].create({
                "company_id": self.company_id.id,
                "product_id": order_line.product_id.id,
                "product_uom_qty": order_line.product_uom_qty,
                "product_uom": order_line.product_uom_id.id,
                "location_id": location_id,
                "location_dest_id": customers_location.id,
                "state": "confirmed",
                "sale_line_id": order_line.id,
            })
            stock_move._set_quantity_done(order_line.product_uom_qty)
            stock_move.picked = True  # To also change move lines created in `_set_quantity_done`
            stock_move._action_done()
            stock_moves |= stock_move
        return stock_moves

    def _fetch_orders_from_marketplace(self):
        """ Override this method in marketplace modules to
        fetch orders from the marketplace and return them in following common format.

        :return: An order structure dictionary with the following keys:
        "error": an error message if any
        "orders": list of orders
            - id (str): Unique identifier/reference for the order on the marketplace.
            - currency_code (str): Order currency code (e.g.: 'INR', 'USD').
            - status (str): Order status with following possible values:
                - 'confirmed': pending, processing, on-hold, confirmed, completed
                - 'canceled': cancelled,
                  {'draft', 'refunded', 'failed', 'trash', 'fraud'}.
            - customer_id (str): ID, code or reference of the customer on marketplace that uniquely identifies them.
            - create_date (str): Order creation or confirmation date (ISO 8601 format recommended).
            - update_date (str): Last updated timestamp of the order.
            - fulfillment_type (str): Fulfillment mode, either:
                - 'FBMa': Fulfilled by Marketplace.
                - 'FBMe': Fulfilled by Merchant.
            - shipping_price (str): Original shipping cost before any discounts.
            - shipping_tax_amount (str): Tax applied on the original shipping cost.
            - shipping_discount (str): Discount applied to the shipping cost.
            - shipping_discount_tax (str): Tax reduction corresponding to the shipping discount.
            - location_id (str): Identifier of the marketplace location (ID, code, or reference) used to decrement stock quantity from the corresponding location in Odoo.
            - billing_address (dict): Billing address fields:
                - name (str): Full name of the buyer or customer.
                - email (str): Email address of the buyer.
                - phone (str)
                - street (str)
                - street2 (str)
                - zip (str)
                - city (str)
                - state_code (str)
                - country_code (str)
                - company_name (str): Company name (if any) to know value of is_company field.
            - shipping_address (dict): Shipping address with same structure as billing_address.
            - other_addresses (list of dict): List of additional addresses (if any), same structure as billing_address.

            - order_lines (list of dict): Order line items. Each item includes:
                - id (int): Internal line identifier.
                - description (str): Description of the product.
                - product_data (dict): Product details:
                    - name (str): Name of the product.
                    - sku (str): SKU of the product.
                    - mp_product_id (str): Unique identifier of the product in the marketplace.
                    - (other marketplace-specific marketplace.offer attributes as needed)
                - uom (str): Unit of measure for the product.
                - qty_ordered (int): Quantity of the item ordered.
                - qty_shipped (int): Quantity of the item that has been shipped.
                - qty_delivered (int): Quantity of the item delivered to the customer.
                - qty_returned (int): Quantity of the item returned.
                - qty_refunded (int): Quantity of the item refunded.
                - qty_canceled (int): Quantity of the item canceled.

                - price_unit (str): Unit sale price of product excluding tax.
                - price_incl_tax (str): Total price including tax.
                - price_subtotal (str): Total price excluding tax (price_unit * qty_ordered).
                - price_total (str): Total price of the item including tax.
                - discount (str): Discount applied to the item.
                - discount_incl_tax (str): Discount amount including tax.
                - discount_tax (str): Tax reduction corresponding to the discount.

                - tax_amount_per_unit
                - tax_amount (float): Total tax amount applied to the item.
                - tax_percent (float): Tax percentage applied to the item.
                - unit_price_excluding_tax
                - unit_price_including_tax
                - discount_excluding_tax
                - discount_including_tax
                - amount_excluding_tax
                - amount_including_tax
                - undiscounted_amount_excluding_tax
                - undiscounted_amount_including_tax
                - undiscounted_unit_price_excluding_tax
                - undiscounted_unit_price_including_tax
                - discount_amount_excluding_tax
                - discount_amount_including_tax
                - discount_amount_per_unit_excluding_tax
                - discount_amount_per_unit_including_tax

            - fulfillments (list of dict): Fulfillments structure same as the one returned by `_fetch_fulfillments_from_marketplace`.
        :rtype: dict
        """
        return {}

    def _fetch_fulfillments_from_marketplace(self):
        """ Override this method in marketplace modules to
        fetch fulfillments from the marketplace and return them in following common format.
        :return: A fulfillment structure dictionary with the following keys:
            error (str): an error message if any
            fulfillments [dict]: list of fulfillments
                - marketplace_picking_identifier (int or str): Unique fulfillment identifier on the marketplace.
                - order_id (str): Unique identifier/reference for the order on the marketplace.
                - location_id (str): Identifier of the marketplace location (ID, code, or reference) used to decrement stock quantity from the corresponding location in Odoo.
                - status (str): Package shipping status. One of: ['pending', 'unshipped', 'shipped', 'delivered', 'returned'].
                - shipping_address (dict): Shipping address of the fulfillment (leave empty if same as order's shipping address):
                    - name (str): Full name of the buyer or customer.
                    - email (str): Email address of the buyer.
                    - phone (int)
                    - street (str)
                    - street2 (str)
                    - zip (int)
                    - city (str)
                    - state_code (str)
                    - country_code (str)
                - line_items [dict]: list of fulfillment lines
                    - fulfillment_line_id (int or str): Unique fulfillment line identifier.
                    - order_line_id (int): Order line id.
                    - product_id (int): Unique identifier of the product in the marketplace.
                    - sku (str): SKU of the product.
                    - qty_shipped (int): Quantity of the product shipped.
                - carrier_id (str): Shipping carrier name.
                - tracking_number (str): Shipment tracking number.
                - tracking_url (str): URL to track the shipment.
        :rtype: dict
        """
        return {}

    def _push_deliveries(self):
        errors = []
        for account in self:
            account._ensure_account_is_authenticated()
            # call your respective API to push fulfillment status on marketplace.
            deliveries = self.env["stock.picking"].search([
                ("state", "=", "done"),
                ("sale_id.marketplace_account_id", "=", account.id),
                ("marketplace_sync_status", "=", "pending"),
            ])
            result = account._push_deliveries_to_marketplace(deliveries)
            if result.get("errors"):
                errors.append(result.get("errors"))
        notification_type = "success"
        notification_message = "Successfully pushed fulfillment to Marketplace(s)."
        if errors:
            notification_type = "warning"
            notification_message = "There is issue during push fulfillment to Marketplace(s)."
        return {
            "type": "ir.actions.client",
            "tag": "display_notification",
            "params": {
                "type": notification_type,
                "message": _(notification_message),
                "next": {"type": "ir.actions.act_window_close"},
            }
        }

    def _push_deliveries_to_marketplace(self, deliveries):
        """Override this method if your marketplace support send multiple deliveries in one request.
        otherwise impliment '_push_delivery_to_marketplace' this method.
        """
        errors = []
        for delivery in deliveries:
            result = self._push_delivery_to_marketplace(delivery)
            if result.get('error'):
                errors.append(result.get('error'))
                delivery.marketplace_sync_status = 'error'
                _logger.error(
                    "Error during push %s delivery to marketplace.",
                    delivery.name
                )
                message_post = _(f"Error during push this delivery to marketplace: {result.get('error')}")
            else:
                fulfillment = result.get('response')
                marketplace_picking_identifier = str(fulfillment.get('id', ''))
                delivery.marketplace_picking_identifier = marketplace_picking_identifier
                delivery.marketplace_sync_status = 'done'
                _logger.info(
                    "Delivery %s pushed successfully to marketplace.",
                    delivery.name
                )
                message_post = _("This delivery has been successfully pushed to the marketplace.")
            delivery.message_post(body=message_post)
        return {'errors': errors}

    def _push_delivery_to_marketplace(self, delivery):
        """Override this method in each marketplace to
        push delivery to the marketplace.

        :param delivery: A record of `stock.picking` to push to the marketplace.

        :rtype: dict
        """
        return {}

    def _push_inventory(self):
        for account in self:
            account._ensure_account_is_authenticated()
            locations = account.marketplace_location_ids.filtered(lambda location: location.matched_location_id)
            offers = account.marketplace_offer_ids.filtered(
                lambda offer: offer.matched_product_id.id != self.env.ref(
                    'marketplace.marketplace_default_product', raise_if_not_found=False
                ).id
            )
            inventory_data = []
            for location in locations:
                for offer in offers:
                    stock_quant = self.env['stock.quant'].search([
                        ('product_id', '=', offer.matched_product_id.id),
                        ('location_id', '=', location.matched_location_id.id)]
                    )
                    if stock_quant:
                        quantity = sum(stock_quant.mapped('quantity'))
                        inventory_data.append({
                            'offer': offer,
                            'location': location,
                            'quantity': quantity,
                        })
            if inventory_data:
                result = account._push_inventory_to_marketplace(inventory_data)
                if result.get("error", ""):
                    raise UserError(_("Error during pushing inventory on Marketplace: %s", result.get('error', '')))
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'type': 'success',
                'message': _("Inventory successfully pushed to marketplace."),
                'next': {'type': 'ir.actions.act_window_close'},
            }
        }

    def _push_inventory_to_marketplace(self, inventory_data):
        """
        Override this method in each marketplace model to implement the logic for pushing inventory.

        :param inventory_data: A list of dictionary containing inventory information to push.
            [
                {
                    'offer': record of marketplace.offer,
                    'quantity': float,  # Quantity of the product to update
                    'location': record of marketplace.location,  # location on which offer's inventory will pushed.
                },
                ...
            ]

        :rtype: dict
        """
        return {}

    # def _create_stock_return_picking(self, product):
    #     marketplace_package_identifier = product.shipping_package_id
    #     product_data = self.env['product.product'].search([
    #         ('default_code', '=', product.sku)
    #     ], limit=1)

    #     package = self.env['stock.picking'].search([
    #         ('sale_id.marketplace_account_id', '=', self.id)
    #         ('marketplace_package_identifier', '=', marketplace_package_identifier)
    #     ], limit=1)

    #     stock_return_picking = self.env['stock.return.picking'].create({
    #         'picking_id': package.id,
    #         'product_return_moves': Command.create({
    #             'product_id': product_data.id,
    #             'quantity': product.quantity
    #         }),
    #         'move_id': package.move_ids
    #     })
    #     return stock_return_picking

    def _handle_sync_failure(self, flow, data, error_messages=False, email_template_xmlid=None):
        """ Send a mail to the responsible persons to report a synchronization failure.

        :param str flow: The flow for which the failure mail is requested. Supported flows are:
                        `product_pull`, `inventory_push`, `order_pull`, `picking_push`.
        :return: None
        """
        self.ensure_one()
        _logger.exception(
            "Failed to execute %s flow for Marketplace Account %s with id %s: Error: %s",
            flow, self.name, self.id, str(error_messages)
        )
        flow_to_email_template_mapper = {
            'product_pull': 'marketplace.product_pull_failure',
            'inventory_push': 'marketplace.inventory_push_failure',
            'order_pull': 'marketplace.order_pull_failure',
            'picking_push': 'marketplace.picking_push_failure',
        }
        mail_template_id = email_template_xmlid or flow_to_email_template_mapper.get(flow)
        if not mail_template_id:
            _logger.error("Unknown flow %s for failure notification.", flow)
            return

        mail_template = self.env.ref(mail_template_id, raise_if_not_found=False)
        if not mail_template:
            _logger.warning("The mail template with xmlid %s has been deleted.", mail_template_id)
        else:
            # FixMe: what to do if no responsible_email can be found.
            responsible_email = self.user_id.email or next(iter(self.company_id.user_ids.mapped('email')))
            if not responsible_email:
                return
            mail_template.with_context(**{
                'email_to': responsible_email,
                'mp_account_id': self.id,
                'mp_account_name': self.name,
                'mp_channel_code': self.channel_code,
                'error_messages': error_messages,
                **data,
            }).send_mail(self.env.user.id)
            _logger.info("Sent synchronization failure notification email to %s", responsible_email)
