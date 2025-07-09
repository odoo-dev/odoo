import logging
import requests
from odoo import _, Command, api, fields, models
from odoo.exceptions import UserError
from odoo.addons.sale_unicommerce import const

_logger = logging.getLogger(__name__)


class UnicommerceAccount(models.Model):
    _name = 'unicommerce.account'
    _description = "Unicommerce Account"
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _rec_name = 'username'

    username = fields.Char(string="Username")
    password = fields.Char(string="Password")
    client_id = fields.Char(string="Client Id")
    grant_type = fields.Char(string="Grant Type")
    channel_ids = fields.Many2many(comodel_name='unicommerce.channel', string="Channels")
    tenant = fields.Char(string="Account Code")
    access_token = fields.Char(string="Access Token")
    refresh_token = fields.Char(string="Refresh Token")
    last_so_sync_datetime = fields.Datetime(string="Last SO Sync")
    last_inventory_sync_datetime = fields.Datetime(string="Last Inventory Sync")
    last_product_sync_datetime = fields.Datetime(string="Last Catalog Sync")
    order_count = fields.Integer(string="Unicommerce Orders", compute="_compute_unicommerce_order_count")
    offer_count = fields.Integer(string="Unicommerce Offers", compute="_compute_unicommerce_products_count")
    state = fields.Selection(
        string="State",
        selection=[('disconnected', "Disconnected"), ('connected', "Connected")],
        compute='_compute_state',
    )

    def _compute_unicommerce_order_count(self):
        for account in self:
            account.order_count = self.env['sale.order'].search_count([('is_unicommerce_order', '=', True)])

    def _compute_unicommerce_products_count(self):
        for account in self:
            account.offer_count = self.env['marketplace.offer'].search_count([])

    @api.depends('refresh_token')
    def _compute_state(self):
        for account in self:
            account.state = 'connected' if account.refresh_token else 'disconnected'

    def action_view_offers(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': _('Offers'),
            'res_model': 'marketplace.offer',
            'view_mode': 'list',
        }

    def action_view_orders(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': _('Orders'),
            'res_model': 'sale.order',
            'view_mode': 'list,form',
            'domain': [('is_unicommerce_order', '=', True)],
            'context': {'create': False},
        }

    def action_link_account(self):
        if self.authenticate_account():
            self.env['crm.team'].create([{"name": channel.name} for channel in self.channel_ids])
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'type': 'success',
                    'sticky': False,
                    'message': _("Account linked successfully and CRM teams created."),
                    'next': {'type': 'ir.actions.act_window_close'},
                }
            }

    # Genral method
    def _call_uc_api(self, endpoint_key, method='POST', data=None, params=None):
        endpoint_path = const.API_ENDPOINTS.get(endpoint_key)
        if not endpoint_path:
            raise UserError(_('Invalid API endpoint: %s') % endpoint_key)

        base_url = f"https://{self.tenant}.unicommerce.com"
        url = f"{base_url}{endpoint_path}"

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"bearer {self.access_token}"
        }
        try:
            response = requests.request(method, url, json=data, headers=headers, params=params, timeout=30)

            # if response.status_code == 401:
            #     self.refresh_access_token()
            #     headers["Authorization"] = f"bearer {self.access_token}"
            #     response = requests.request(method, url, json=data, headers=headers, timeout=30)
            if not response:
                # _logger.error("Empty response received from Unicommerce API at: %s", url)
                self._raise_uc_error("No response received from Unicommerce API.")
                # raise UserError(_("No response received from Unicommerce API."))

            if response.status_code not in const.SUCCESS_CODES:
                self._raise_uc_error("Unicommerce API Error:")
                # _logger.error("Unicommerce API Error %s: %s", response.status_code, response.text)
                # raise UserError(_('Unicommerce API Error: %s') % response.text)
            return response.json()

        except requests.exceptions.Timeout:
            self._raise_uc_error("Request timed out while accessing Unicommerce API", url)
            # _logger.exception("Timeout while calling Unicommerce API: %s", url)
            # raise UserError(_("Request timed out while accessing Unicommerce API."))

        except requests.exceptions.ConnectionError:
            self._raise_uc_error("Could not connect to Unicommerce. Please check your internet or try again later.", url)            
            # _logger.exception("Connection error while calling Unicommerce API: %s", url)
            # raise UserError(_("Could not connect to Unicommerce. Please check your internet or try again later."))

        except requests.exceptions.RequestException as e:
            self._raise_uc_error("A request error occurred while calling Unicommerce API", url, e)
            #  _logger.exception("Request error while calling Unicommerce API: %s", url)
            #  raise UserError(_("A request error occurred while calling Unicommerce API: %s") % str(e))

    # Authentication
    def authenticate_account(self):
        """Authenticate and retrieve access + refresh tokens"""
        # url = f"https://{self.tenant}.unicommerce.com/oauth/token"
        url = "https://128942f2-36be-4c1e-9752-e38f445fd8d0.mock.pstmn.io/oauth/token"
        params = {
            'grant_type': self.grant_type,
            'username': self.username,
            'password': self.password,
            'client_id': self.client_id,
        }
        headers = {'Content-Type': 'application/json'}

        try:
            response = requests.get(url, params=params, headers=headers, timeout=30)
            if response.status_code != 200:
                raise UserError(_('Authentication failed: %s') % response.text)
            tokens = response.json()
            self.write({
                'access_token': tokens.get('access_token'),
                'refresh_token': tokens.get('refresh_token'),
            })
            _logger.info("Authenticated Unicommerce account: %s", self.username)
            return True
        except Exception as e:
            self._raise_uc_error("Authentication", url, e)
            # _logger.exception("Authentication failed")
            # raise UserError(_('Authentication failed: %s') % str(e))

    def refresh_access_token(self):
        """Refresh the access token using refresh_token"""
        url = f"https://{self.tenant}.unicommerce.com/oauth/token"
        params = {
            'grant_type': 'refresh_token',
            'refresh_token': self.refresh_token,
            'client_id': self.client_id,
        }
        headers = {'Content-Type': 'application/json'}

        try:
            response = requests.post(url, params=params, headers=headers, timeout=30)
            if response.status_code != 200:
                raise UserError(_('Token refresh failed: %s') % response.text)
            tokens = response.json()
            self.write({
                'access_token': tokens.get('access_token'),
                'refresh_token': tokens.get('refresh_token'),
            })
            _logger.info("Refreshed token for: %s", self.username)
        except Exception as e:
            self._raise_uc_error("Token refresh error", url, e)
            
            # _logger.exception("Token refresh error")
            # raise UserError(_('Token refresh error: %s') % str(e))

    # pull product
    def action_sync_products(self):
        uc_products = self.search_unicommerce_items()
        for uc_product in uc_products:
            uc_product_detail = self.get_unicommerce_item(uc_product)
            self.create_item(uc_product_detail)
        self.last_product_sync_datetime = fields.Datetime.now()

    def search_unicommerce_items(self):
        payload = {
            # 'updatedSinceInHour': self.last_product_sync_datetime.isoformat() - fields.Datetime.now().isoformat() if self.last_product_sync_datetime else ""            
            'updatedSinceInHour': self.last_product_sync_datetime.isoformat() if self.last_product_sync_datetime else ""
        }
        response = self._call_uc_api('search_items', 'POST', payload)
        return response.get('elements', [])

    def get_unicommerce_item(self, product):
        payload = {
            "code": product.get('skuCode')
        }
        return self._call_uc_api('get_item_details', 'POST', payload)

    def create_item(self, uc_product_detail):
        item_detail = uc_product_detail.get('itemTypeDTO', {})

        internal_product = self.env['product.product'].search([('default_code', '=', item_detail.get('skuCode'))], limit=1)
        if not internal_product:
            self.env['product.product'].create({
                'name': uc_product_detail.name,
                'default_code': uc_product_detail.skuCode
                # 'uom_id': self.env.ref('uom.product_uom_unit').id,
                # 'standard_price': 110.0,
                # 'supplier_taxes_id': [(6, 0, tax_price_include.ids)],
            })
            market_offer_rec = self.env['marketplace.offer'].search([('sku', '=', item_detail.get('skuCode'))], limit=1)
            if market_offer_rec:
                market_offer_rec.write(item_detail)
            else:
                self.env['marketplace.offer'].create({
                    'external_id': uc_product_detail.id,
                    'sku': uc_product_detail.skuCode
                })

    # push product
    def upload_items_to_unicommerce(self, item_codes):
        payload = self._build_unicommerce_item(item_codes)
        response = self.create_update_item(payload)
        if not response.get('successful'):
            _logger.error("[upload_items_to_unicommerce] Product push failed: %s", response)
            raise UserError(_('Product Push Failed: %s') % response.get('message', 'Unknown error'))

    def _build_unicommerce_item(self, item_code):
        itemTypes = []
        products = self.env['product.product'].search([('is_unicommerce_product', '=', True)])
        for product in products:
            categ_status = self.create_update_category(product)

            if categ_status:
                item_data = {
                    'categoryCode': product.categ_id,
                    'skuCode': product.default_code,
                    'name': product.name,
                    'itemSku': product.default_code,
                    'quantity': product.qty_available,
                    'price': product.lst_price,
                    # 'name': "",  # custom field name 
                }
                # if product.image_1920:
                #     item_data['imageUrl'] = f"/web/image/product.product/{product.id}/image_1920"
                # if product.categ_id:
                #     item_data['category'] = product.categ_id.name
                itemTypes.append(item_data)
        if not itemTypes:
            raise UserError(_('No Unicommerce-tagged products to push.'))
        payload = {"itemTypes": itemTypes}
        return payload

    def create_update_item(self, payload, update=False):
        return self._call_uc_api('create_update_items', 'POST', payload)

    def create_update_category(self, product):
        payload = {
            "category": {
                "code": product.categ_id.id,
                "name": product.categ_id.name,
                "gstTaxTypeCode": "gst"
            }
        }
        response = self._call_uc_api('create_update_category', 'POST', payload)
        if response.get('successful'):
            return True
        else:
            _logger.warning("[create_update_category] Category push failed for category ID: %s, response: %s", product.categ_id.id, response)
            return False

    # Sync Sale Order
    def action_sync_orders(self):
        uc_orders = self.search_sale_order()
        for uc_order in uc_orders or []:
            try:
                uc_order_detail = self.get_sale_order(uc_order.get('code'))
                self.create_order(uc_order_detail)
            except Exception as e:
                _logger.exception("[sync_orders] Failed to process order %s: %s", uc_order.get('code'), e)
            self.last_so_sync_datetime = fields.Datetime.now()

    def search_sale_order(self):
        from_date = self.last_so_sync_datetime.isoformat() if self.last_so_sync_datetime else ""
        to_date = fields.Datetime.now().isoformat()

        payload = {
            "fromDate": from_date,
            "toDate": to_date,
            "dateType": "CREATED"
        }

        response = self._call_uc_api('search_sale_orders', 'POST', payload)
        return response.get('elements', [])

    def get_sale_order(self, sku):
        payload = {"code": sku}
        return self._call_uc_api('get_sale_order', 'POST', payload)

    def create_order(self, uc_order_detail):
        order_data = uc_order_detail.get('saleOrderDTO', {})
        if not order_data:
            _logger.warning("[create_order] Missing 'saleOrderDTO' in response.")
            return
        channel_code = order_data.get('channel', '')
        customer_email = order_data.get('notificationEmail')
        customer_name = order_data.get('customerName') or "Unicommerce Customer"
        team = self.env['crm.team'].search([('name', '=', channel_code)], limit=1)
        team_id = team.id if team else False
        partner = self.env['res.partner'].search([('email', '=', customer_email)], limit=1)
        if not partner:
            partner = self.create_partner(customer_name, customer_email)
        # Prepare order lines
        order_line_items = uc_order_detail.get('saleOrderItems', [])
        order_lines_data = self.create_order_line(order_line_items)
        if not order_lines_data:
            _logger.warning("[create_order] No valid order lines found for order %s", order_data.get('code'))
            return
        sale_order = self.env['sale.order'].create({
            'partner_id': partner.id,
            'is_unicommerce_order': True,
            'team_id': team_id,
            'order_line': order_lines_data,
            # 'note': f"Imported from Unicommerce - Channel: {channel_code}",
        })
        _logger.info("[create_order] Sale order %s created for Unicommerce order %s", sale_order.name, order_data.get('code'))

    def create_partner(self, name, email):
        partner = self.env['res.partner'].create({
            'name': name,
            'email': email,
        })
        _logger.info("[create_partner] Created new partner: %s <%s>", name, email)
        return partner

    def create_order_line(self, order_line_items):
        order_lines_data = []

        for item in order_line_items:
            sku = item.get('itemSku')
            product = self.env['product.product'].search([('default_code', '=', sku)], limit=1)

            if not product:
                _logger.warning("[create_order_line] Product with SKU %s not found in Odoo.", sku)
                continue

            order_lines_data.append(Command.create({
                'product_id': product.id,
                'product_uom_qty': item.get('quantity', 1),
                'price_unit': item.get('totalPrice', 0),
                'name': product.name,
            }))

        return order_lines_data

    # Adjust inventory
    def action_update_inventory(self):
        inventory_data = self.prepare_inventory_data()
        if inventory_data:
            updated_inventory = self.update_inventory(inventory_data)
            responses = updated_inventory.get("inventoryAdjustmentResponses", [])
            for item_response in responses:
                if not item_response.get("successful", False):
                    error_detail = item_response.get("errors", [])
                    for err in error_detail:
                        _logger.error("Inventory Update Failed: SKU %s, Code %s, Message: %s",
                                      item_response.get("facilityInventoryAdjustment", {}).get("itemSKU"),
                                      err.get("code"), err.get("message")) 
            self.last_inventory_sync_datetime = fields.Datetime.now()

    def prepare_inventory_data(self):
        inventory_data = []
        products = self.env['product.product'].search([('is_unicommerce_product', '=', True)])
        for product in products:
            inventory_data.append({
                {
                    'itemSKU': product.default_code,
                    'quantity': product.qty.available,
                    'shelfCode': "123",  # correct this
                    # 'transferToShelfCode': ,
                    'adjustmentType': 'Add', 	# Allowable: ADD, REMOVE, REPLACE, TRANSFER
                    'facilityCode': '1233'  # correct this
                }
            })
        return inventory_data

    def update_inventory(self, inventory_data):
        payload = {
            'inventoryAdjustments': inventory_data,
            'forceAllocate': 'false',  	# If true, system forcibly updates inventory even if validations fail.
        }
        return self._call_uc_api('update_inventory', 'POST', payload)
    
    def _raise_uc_error(self, message, url=None, exc=None):
        _logger.exception("%s: %s", message, url)
        if exc:
            raise UserError(_("%s: %s") % (message, str(exc)))
        raise UserError(_(message))
