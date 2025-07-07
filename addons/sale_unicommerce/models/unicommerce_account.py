# Part of Odoo. See LICENSE file for full copyright and licensing details.

import requests
import logging
from odoo import _, api, fields, models
from odoo.fields import Command
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)
JsonDict = dict[str, Any]


class UnicommerceAccount(models.Model):
    _name = 'unicommerce.account'
    _description = "Unicommerce Account"
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _rec_name = 'username'
    
    name = fields.Char()
    username = fields.Char(string="Username")
    password = fields.Char(string="Password")
    client_id = fields.Char(string="Client Id")
    grant_type = fields.Char(string="Grant Type")
    channel_ids = fields.Many2many(comodel_name='unicommerce.channel', string="Channels")
    tenant = fields.Char(strin="Account Code")
    access_token = fields.Char(string="Access Token")
    refresh_token = fields.Char(string="Refresh Token")
    last_so_sync_datetime = fields.Datetime(string="Last SO Sync")
    last_product_sync_datetime = fields.Datetime()
    base_url = fields.Char()
    # last_inventory_sync_datetime = fields.Datetime()
    order_count = fields.Integer(string="Unicommerce Orders", compute="_compute_unicommerce_order_count")
    offer_count = fields.Integer(string="Unicommerce Orders", compute="_compute_unicommerce_products_count")
    state = fields.Selection(
        string="State",
        selection=[('disconnected', "Disconnected"), ('connected', "Connected")],
        compute='_compute_state',
    )

    def _compute_unicommerce_order_count(self):
        for order in self:
            order.order_count = self.env['sale.order'].search_count([('is_unicommerce_order', '=', True)])
            
    def _compute_unicommerce_products_count(self):
        for order in self:
            order.offer_count = self.env['marketplace.offer'].search_count([])
            
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
        self.env['crm.team'].create([{"name": channel.name}for channel in self.channel_ids])
        # url = f"https://{self.tenant}.unicommerce.com/oauth/token"
        url = "https://52aa8c81-123a-483a-95bb-15e24b848d4c.mock.pstmn.io/token"
        params = {
            "grant_type": self.grant_type,
            "client_id": self.client_id,
            "username": self.username,
            "password": self.password
        }

        try:
            response = requests.get(
                url=url,
                params=params,
                headers={'Content-type': 'application/json'},
                timeout=30
            )

            # Check response status
            if response.status_code == 200:
                data = response.json()
                if data.get('refresh_token') and data.get('access_token'):
                    self.access_token = data.get('access_token')
                    self.refresh_token = data.get('refresh_token')
                    _logger.info("Unicommerce account linked successfully.")
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
            else:
                _logger.error("Failed to link Unicommerce account. Status: %s, Response: %s",
                              response.status_code, response.text)
                raise Exception(_("Failed to link Unicommerce account: %s") % response.text)

        except requests.exceptions.Timeout:
            _logger.exception("Request to Unicommerce timed out.")
            raise Exception(_("Request to Unicommerce timed out. Please try again."))

        except Exception as e:
            _logger.exception("General error while linking Unicommerce account.")
            raise Exception(_("An error occurred: %s") % str(e))        
        
    def action_sync_SO(self):
        """
        Sync Sales Orders from Unicommerce to Odoo with proper response handling
        """
        url = f"https://{tenant}.unicommerce.com/services/rest/v1/oms/saleOrder/search"

        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'bearer {self.access_token}',
        }

        data = {
            "fromDate": self.last_so_sync_datetime.isoformat() if self.last_so_sync_datetime else "",
            "toDate": fields.Datetime.now().isoformat(),
            "dateType": "CREATED"
        }

        try:
            response = requests.post(
                url=url,
                json=data,
                headers=headers,
                timeout=30
            )

            if response.status_code != 200:
                _logger.error("Unicommerce SO sync HTTP Error: %s - %s", response.status_code, response.text)
                raise Exception(_("HTTP Error from Unicommerce: %s") % response.status_code)

            response_json = response.json()

            # Log and handle warnings
            warnings = response_json.get("warnings", [])
            if warnings:
                for warning in warnings:
                    _logger.warning("Unicommerce Warning: %s - %s", warning.get("code"), warning.get("message"))

            # Log and raise errors if any
            errors = response_json.get("errors", [])
            if errors:
                for error in errors:
                    _logger.error("Unicommerce Error: Code %s, Field %s, Message: %s",
                                  error.get("code"), error.get("fieldName"), error.get("message"))
                raise Exception(_("Unicommerce returned errors during sync. Check logs for details."))

            # Proceed only if successful
            if response_json.get("successful"):
                sale_orders = response_json.get("elements", [])
                if sale_orders:
                    self.create_sale_orders_from_unicommerce(sale_orders)
                else:
                    _logger.info("No new Sale Orders to sync from Unicommerce.")
                # Update last sync time after successful fetch
                self.last_so_sync_datetime = fields.Datetime.now()
            else:
                _logger.error("Unicommerce response was not successful. Message: %s", response_json.get("message"))
                raise Exception(_("Failed to sync Sales Orders: %s") % response_json.get("message"))

        except requests.exceptions.RequestException as req_err:
            _logger.exception("Request error during Unicommerce SO sync.")
            raise Exception(_("Request error occurred: %s") % str(req_err))
        except Exception as e:
            _logger.exception("Unexpected error during Unicommerce SO sync.")
            raise Exception(_("Unexpected error occurred: %s") % str(e))
        
    def action_sync_catalog(self):
        self.last_product_sync_datetime = fields.Datetime.now()
        url = "https://092c3604-2186-4ff4-9c93-2d0b753e3830.mock.pstmn.io/services/rest/v1/product/itemType/search"
        
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'bearer {self.access_token}',
        }
        
        data = {
            # 'updatedSinceInHour': self.last_product_sync_datetime.isoformat() - fields.Datetime.now().isoformat() if self.last_product_sync_datetime else ""
            'updatedSinceInHour': self.last_product_sync_datetime.isoformat() if self.last_product_sync_datetime else ""
            
        }
        try:
            response = requests.post(
                url=url,
                json=data,
                headers=headers,
                timeout=30
            )

            if response.status_code != 200:
                _logger.error("Unicommerce SO sync HTTP Error: %s - %s", response.status_code, response.text)
                raise Exception(_("HTTP Error from Unicommerce: %s") % response.status_code)

            breakpoint()
            response_json = response.json()

            # Log and handle warnings
            warnings = response_json.get("warnings", [])
            if warnings:
                for warning in warnings:
                    _logger.warning("Unicommerce Warning: %s - %s", warning.get("code"), warning.get("message"))

            # Log and raise errors if any
            errors = response_json.get("errors", [])
            if errors:
                for error in errors:
                    _logger.error("Unicommerce Error: Code %s, Field %s, Message: %s",
                                  error.get("code"), error.get("fieldName"), error.get("message"))
                raise Exception(_("Unicommerce returned errors during sync. Check logs for details."))

            # Proceed only if successful
            if response_json.get("successful"):
                products = response_json.get("elements", [])
                if products:
                    self.create_product_from_unicommerce(products)
                else:
                    _logger.info("No new Sale Orders to sync from Unicommerce.")
                # Update last sync time after successful fetch
                self.last_so_sync_datetime = fields.Datetime.now()
            else:
                _logger.error("Unicommerce response was not successful. Message: %s", response_json.get("message"))
                raise Exception(_("Failed to sync Sales Orders: %s") % response_json.get("message"))

        except requests.exceptions.RequestException as req_err:
            _logger.exception("Request error during Unicommerce SO sync.")
            raise Exception(_("Request error occurred: %s") % str(req_err))
        except Exception as e:
            _logger.exception("Unexpected error during Unicommerce SO sync.")
            raise Exception(_("Unexpected error occurred: %s") % str(e))
        
    # def create_product_from_unicommerce(self, products, tenant):
    def create_product_from_unicommerce(self, products):
        # url = f"https://{tenant}.unicommerce.com/services/rest/v1/catalog/itemType/get"
        url = f"https://d50cdb29-596e-4875-8e18-92c851de7cda.mock.pstmn.io/services/rest/v1/catalog/itemType/get"
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'bearer {self.access_token}',
        }
        for product in products:
            sku = product.get('skuCode')
            data = {
                "code": product.get('skuCode')
            }
            
            try:
                response = requests.post(
                    url=url,
                    json=data,
                    headers=headers,
                    timeout=30
                )
                response_json = response.json()
            except Exception as e:
                _logger.error(f"Failed to fetch order {data['code']} from Unicommerce: {str(e)}")
                continue  
            
            if not response_json.get('successful'):
                errors = response_json.get('errors', [])
                _logger.error(f"[{sku}] API returned errors: {errors}")
                continue
          
            product_data = response_json.get('itemTypeDTO', {})
            breakpoint()
            
            internal_product = self.env['product.product'].search([('default_code', '=', product_data.get('skuCode'))], limit=1)
            
            if not internal_product:
                try:
                    self.env['product.product'].create({
                        'name': product.name,
                        'default_code': product.skuCode
                        # 'uom_id': self.env.ref('uom.product_uom_unit').id,
                        # 'standard_price': 110.0,
                        # 'supplier_taxes_id': [(6, 0, tax_price_include.ids)],
                    })
                except Exception as e:
                    _logger.error(f"[{sku}] Failed to create product in Odoo: {e}")
                    continue

            try:
                market_offer_rec = self.env['product.product'].search([('default_code', '=', product_data.get('skuCode'))], limit=1)

                if market_offer_rec:
                    market_offer_rec.write(product_data)
                else:
                    self.env['marketplace.offer'].create({
                        'external_id': product.id,
                        'sku': product.skuCode
                    })
            except Exception as e:
                _logger.error(f"[{sku}] Failed to create/update marketplace offer: {e}")
                continue

                                        
    def action_update_inventory(self):
        url = f"https://{tenant}.unicommerce.com/services/rest/v1/inventory/adjust/bulk"
        
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'bearer {self.access_token}',
        }
        
        offerce = self.env['marketplace.offer'].search([])
        inventoryAdjustments = []
        
        for offer in offerce:
            inventoryAdjustments.append({
                {
                    'itemSKU': offer.sku,
                    'quantity': self.env['product.product'].search([('default_code', '=', offer.sku)], limit=1).qty.available,
                    # 'shelfCode': ,
                    # 'transferToShelfCode': ,
                    'adjustmentType': 'Add', 	# Allowable: ADD, REMOVE, REPLACE, TRANSFER
                    # 'facilityCode': , 
                }                
            })
        data = {
            'inventoryAdjustments': inventoryAdjustments,
            'forceAllocate': 'false',  	# If true, system forcibly updates inventory even if validations fail.            
        }    
        
        try:
            response = requests.post(
                url=url,
                json=data,
                headers=headers,
                timeout=30
            )
            
        except requests.exceptions.RequestException as e:
            _logger.error("HTTP Request Error while updating inventory: %s", str(e))
            raise UserError(_("Failed to connect to Unicommerce: %s") % str(e))

        response_json = response.json()        

        # Log and handle warnings
        warnings = response_json.get("warnings", [])
        if warnings:
            for warning in warnings:
                _logger.warning("Unicommerce Warning: %s - %s", warning.get("code"), warning.get("message"))
                
        # Log and raise errors if any
        errors = response_json.get("errors", [])
        if errors:
            for error in errors:
                _logger.error("Unicommerce Error: Code %s, Field %s, Message: %s",
                              error.get("code"), error.get("fieldName"), error.get("message"))
            raise Exception(_("Unicommerce returned errors during sync. Check logs for details."))                         
        
        responses = response_json.get("inventoryAdjustmentResponses", [])
        for item_response in responses:
            if not item_response.get("successful", False):
                error_detail = item_response.get("errors", [])
                for err in error_detail:
                    _logger.error("Inventory Update Failed: SKU %s, Code %s, Message: %s",
                                  item_response.get("facilityInventoryAdjustment", {}).get("itemSKU"),
                                  err.get("code"), err.get("message"))
    
        if response_json.get("successful", False):
            _logger.info("Inventory updated successfully for all items.")
        else:
            raise UserError("Inventory update failed for one or more items. Check logs.")    
    
    def create_sale_orders_from_unicommerce(self, sale_orders, tenant):
        url = f"https://{tenant}.unicommerce.com/services/rest/v1/oms/saleOrder/get"

        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'bearer {self.access_token}',
        }

        for sale_order in sale_orders:
            data = {
                "code": sale_order.get('code')
            }

            try:
                response = requests.post(
                    url=url,
                    json=data,
                    headers=headers,
                    timeout=30
                )
                response_json = response.json()
            except Exception as e:
                _logger.error(f"Failed to fetch order {data['code']} from Unicommerce: {str(e)}")
                continue

            # Extract order-level details
            order_data = response_json.get('saleOrderDTO', {})
            channel_code = order_data.get('channel')
            customer_email = order_data.get('notificationEmail')
            customer_name = order_data.get('customerName') or "Unicommerce Customer" # correct from response
            team_id = self.env['crm.team'].search([('name', '=', channel_code)])

            # Find or create partner (customer)
            partner = self.env['res.partner'].search([('email', '=', customer_email)], limit=1)
            if not partner:
                partner = self.env['res.partner'].create({
                    'name': customer_name,
                    'email': customer_email,
                })

            # Prepare sale order lines
            order_lines_data = []
            for item in response_json.get('saleOrderItems', []):
                product = self.env['product.product'].search([('default_code', '=', item.get('itemSku'))], limit=1)
                if not product:
                    _logger.warning(f"Product with SKU {item.get('itemSku')} not found in Odoo.")
                    continue

                order_lines_data.append(Command.create({
                    'product_id': product.id,
                    'product_uom_qty': item.get('quantity', 1), # correct from response
                    'price_unit': item.get('totalPrice', 0),
                    'name': product.name,
                    # 'marketplace_offer_id'
                }))

            if not order_lines_data:
                _logger.warning(f"No valid order lines found for order {data['code']}")
                continue
            # Create Sale Order
            self.env['sale.order'].create({
                'partner_id': partner.id,
                'is_unicommerce_order': True,
                'team_id': team_id,
                # 'note': f"Imported from Unicommerce - Channel: {channel_code}",
                'order_line': order_lines_data,
                # 'unicommerce_invoice_code': sale_order.get('shippingPackages').invoiceCode
            })
            
    def refresh_access_token(self):
        url = "https://{tenant}.unicommerce.com/oauth/token"
        params = {
            "grant_type": self.grant_type,
            "client_id": self.client_id,
            "refresh_token": self.refresh_token,
        }

        try:
            response = requests.get(
                url=url,
                params=params,  # Use query parameters
                headers={'Content-type': 'application/json'},
                timeout=30
            )

            # Check response status
            if response.status_code == 200:
                data = response.json()
                self.access_token = data.get('access_token')
                self.refresh_token = data.get('refresh_token')
                _logger.info("Unicommerce account linked successfully.")
            else:
                _logger.error("Failed to link Unicommerce account. Status: %s, Response: %s",
                              response.status_code, response.text)
                raise Exception(_("Failed to link Unicommerce account: %s") % response.text)

        except requests.exceptions.Timeout:
            _logger.exception("Request to Unicommerce timed out.")
            raise Exception(_("Request to Unicommerce timed out. Please try again."))

        except Exception as e:
            _logger.exception("General error while linking Unicommerce account.")
            raise Exception(_("An error occurred: %s") % str(e))
        
    def push_product_on_unicommerce(self):
        breakpoint()
        url = f"https://{tenant}.unicommerce.com/services/rest/v1/catalog/itemTypes/createOrEdit"
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'bearer {self.access_token}',
        }
        itemTypes = []
        products = self.env['product.product'].search([('is_unicommerce_product', '=', True)])
        for product in products:
            self.create_or_update_category('122313', product.name)
                
            itemTypes.append({
                'categoryCode': '',
                'skuCode': product.default_code,
                'name': product.name,
                'itemSku': product.default_code,
                'quantity': product.qty_available,
                'price': product.lst_price,            
            })
        data = {
           'itemTypes':itemTypes 
        }    
        try:
            response = requests.post(
                url=url,
                json=data,
                headers=headers,
                timeout=30
            )
            response_json = response.json()
        except Exception as e:
            _logger.exception("Failed to sync products with Unicommerce.")
            raise UserError(_("Failed to sync products. Error: %s") % str(e))
                    
        if response_json.get("successful", False):
            _logger.info("Successfully synced %s products with Unicommerce.", len(itemTypes))

        else:
            _logger.error("Sync failed: %s", response_json)
            raise UserError(_("Product sync failed. Check logs for more info."))
        
    def create_or_update_category(self, code, name):
        url = f"https://{tenant}.unicommerce.com/services/rest/v1/product/category/addOrEdit"
        # headers = {
        #     'Content-Type': 'application/json',
        #     'Authorization': f'bearer {self.access_token}',
        # }
        # data = {
        #     'category': {
        #         'code': code,
        #         'name': name,
        #         # 'gstTaxTypeCode':     
        #     }
        # }  
        # try:
        #     response = requests.post(
        #         url=url,
        #         json=data,
        #         headers=headers,
        #         timeout=30
        #     )
        #     response_json = response.json()
        # except Exception as e:
        #     _logger.exception("Failed to sync products with Unicommerce.")
        #     raise UserError(_("Failed to sync products. Error: %s") % str(e))
                    
        # if response_json.get("successful", False):
        #     _logger.info("Successfully create category.", len(itemTypes))

        # else:
        #     _logger.error("Sync failed: %s", response_json)
        #     raise UserError(_("Product sync failed. Check logs for more info.")) 
        
        # def create_update_item(self):
        #     url = f"https://{tenant}.unicommerce.com/services/rest/v1/catalog/itemType/createOrEdit"
        #     headers = {
        #         'Content-Type': 'application/json',
        #         'Authorization': f'bearer {self.access_token}',
        #     }
        #     data = {
        #         "itemType": {
        #             "categoryCode":
        #         }
        #     }
        #     try:
        #         response = requests.post(
        #             url=url,
        #             json=data,
        #             headers=headers,
        #             timeout=30
        #         )
        #         response_json = response.json()
        #     except Exception as e:
        #         _logger.exception("Failed to sync products with Unicommerce.")
        #         raise UserError(_("Failed to sync products. Error: %s") % str(e))

        #     if response_json.get("successful", False):
        #         _logger.info("Successfully create category.", len(itemTypes))

        #     else:
        #         _logger.error("Sync failed: %s", response_json)
        #         raise UserError(_("Product sync failed. Check logs for more info."))
