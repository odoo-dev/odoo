import logging

from odoo import models, api, Command, fields

_logger = logging.getLogger(__name__)

class ProductTemplate(models.Model):
    _inherit = 'product.template'

    # override original create methods and add field company_id = self.env.company.id to each record in vals_list
    def create(self, vals_list):
        if isinstance(vals_list, dict):
            vals = vals_list
            if 'company_id' not in vals or not vals['company_id']:
                vals['company_id'] = self.env.company.id
            return super(ProductTemplate, self).create(vals)
        elif isinstance(vals_list, list):
            for vals in vals_list:
                if 'company_id' not in vals or not vals['company_id']:
                    vals['company_id'] = self.env.company.id
            return super(ProductTemplate, self).create(vals_list)
        else:
            raise ValueError("Invalid vals_list type: %s" % type(vals_list))


    @api.model
    def get_products_data(self, company_id, since_date=None):
        """
            This method returns a structured JSON data for all products along with its
            variants, attributes, attribute values

            This method will be called via jsonrpc from odoo instance to pull products data
            from omnicommece
        """
        # Get all product templates for the current company (we will get company id of user who is calling this method)
        product_templates = self.env['product.template'].search([
            ('company_id', '=', company_id),
            ('write_date', '>=', since_date) if since_date else ('write_date', '!=', False)
            ])
        
        # Generate structured JSON for all products
        products_json = []
        for product_template in product_templates:
            product_json = self.get_odoo_product_json(product_template)
            if not product_json.get('has_variants') and product_json.get('default_code') is None or product_json.get('default_code') == '':
                continue
            products_json.append(product_json)
            
        return products_json

    def get_odoo_product_json(self, product_template):
        """
        Returns a structured JSON for a product.template record,
        including variants, attributes, attribute values, and relationships.
        """
        # This is the main structure of the JSON response
        # To-do: Add more fields as needed (a lot!)
        result = {
            "id": product_template.id,
            "name": product_template.name,
            "default_code": product_template.default_code,
            "type": product_template.type,
            "list_price": product_template.list_price,
            "barcode": product_template.barcode,
            "active": product_template.active,
            "sale_ok": product_template.sale_ok,
            "purchase_ok": product_template.purchase_ok,
            "weight": product_template.weight,
            "volume": product_template.volume,
            "tracking": product_template.tracking,
            'standard_price': product_template.standard_price,
            "categ_id": {
                "id": product_template.categ_id.id,
                "name": product_template.categ_id.name,
            } if product_template.categ_id else None,
            "uom_id": {
                "id": product_template.uom_id.id,
                "name": product_template.uom_id.name,
            } if product_template.uom_id else None,
            "company_id": {
                "id": product_template.company_id.id,
                "name": product_template.company_id.name,
            } if product_template.company_id else None,
            "attribute_lines": [],
            "variants": [],
            "has_variants": len(product_template.product_variant_ids) > 1,
            "variant_count": len(product_template.product_variant_ids),
            "taxes_id": [
                {
                    "id": tax.id, 
                    "name": tax.name, 
                    "amount": tax.amount,
                    "amount_type": tax.amount_type,
                    "type_tax_use": tax.type_tax_use,
                    "tax_scope": tax.tax_scope,
                    "description": tax.description,
                    "sequence": tax.sequence,
                    "active": tax.active,
                    "include_in_price": tax.price_include,
                    "tax_group_id": {
                        "id": tax.tax_group_id.id,
                        "name": tax.tax_group_id.name
                    } if tax.tax_group_id else None,
                    "country_id": {
                        "id": tax.country_id.id,
                        "name": tax.country_id.name,
                        "code": tax.country_id.code
                    } if tax.country_id else None
                }
                for tax in product_template.taxes_id
            ],
            "supplier_taxes_id": [
                {
                    "id": tax.id, 
                    "name": tax.name, 
                    "amount": tax.amount,
                    "amount_type": tax.amount_type,
                    "type_tax_use": tax.type_tax_use,
                    "tax_scope": tax.tax_scope,
                    "description": tax.description,
                    "sequence": tax.sequence,
                    "active": tax.active,
                    "include_in_price": tax.price_include,
                    "tax_group_id": {
                        "id": tax.tax_group_id.id,
                        "name": tax.tax_group_id.name
                    } if tax.tax_group_id else None,
                    "country_id": {
                        "id": tax.country_id.id,
                        "name": tax.country_id.name,
                        "code": tax.country_id.code
                    } if tax.country_id else None
                }
                for tax in product_template.supplier_taxes_id
            ],
            "route_ids": [
                {"id": route.id, "name": route.name}
                for route in product_template.route_ids
            ],
        }

        # Attribute lines and values (for variant products)
        for line in product_template.attribute_line_ids:
            result["attribute_lines"].append({
                "id": line.id,
                "attribute_id": {
                    "id": line.attribute_id.id,
                    "name": line.attribute_id.name,
                    "display_type": line.attribute_id.display_type,
                    "create_variant": line.attribute_id.create_variant,
                },
                "value_ids": [
                    {
                        "id": val.id, 
                        "name": val.name,
                        "html_color": getattr(val, 'html_color', None),
                        "is_custom": getattr(val, 'is_custom', False)
                    }
                    for val in line.value_ids
                ]
            })

        # Product variants with their specific attribute values
        for variant in product_template.product_variant_ids:
            if not variant.default_code or variant.default_code == '':
                continue
            variant_data = {
                "id": variant.id,
                "name": variant.name,
                "display_name": variant.display_name,
                "default_code": variant.default_code,
                "barcode": variant.barcode,
                "active": variant.active,
                "lst_price": variant.lst_price,
                "standard_price": variant.standard_price,
                "weight": variant.weight,
                "volume": variant.volume,
                "combination_indices": getattr(variant, 'combination_indices', ''),
                "product_template_attribute_value_ids": []
            }
            
            # Add specific attribute values for this variant
            for val in variant.product_template_attribute_value_ids:
                variant_data["product_template_attribute_value_ids"].append({
                    "id": val.id,
                    "name": val.name,
                    "html_color": getattr(val, 'html_color', None),
                    "attribute_id": {
                        "id": val.attribute_id.id,
                        "name": val.attribute_id.name,
                    },
                    "product_attribute_value_id": {
                        "id": val.product_attribute_value_id.id,
                        "name": val.product_attribute_value_id.name,
                    } if val.product_attribute_value_id else None
                })
            
            result["variants"].append(variant_data)

        return result
    
    @api.model
    def receive_products_data(self, products_data, company_id):
        """
            Receives product data in JSON format from Odoo instance and updates
            products here in omnicommerce.
        """
        # keeping track of created, updated and skipped products (may or may not be used in the future)
        # if used, need to be more expressive
        created_count, updated_count, skipped_count = 0, 0, 0
     
        # Main loop to process each product as well as products with variants
        for product_data in products_data:
            try:
                is_variant_product = product_data.get('has_variants', False)
                # For simple product, skip if default_code is missing
                if not is_variant_product:
                    if not product_data.get('default_code'):
                        skipped_count += 1
                        continue
                    result = self._sync_simple_product(product_data, company_id)
                    if result == 'created':
                        created_count += 1
                    elif result == 'updated':
                        updated_count += 1
                    else:
                        skipped_count += 1
                else:
                    # For variant product, check all variants for default_code
                    variants = product_data.get('variants', [])
                    valid_variants = [v for v in variants if v.get('default_code')]
                    if not valid_variants:
                        skipped_count += 1
                        continue
                    result = self._sync_variant_product(product_data, valid_variants, company_id)
                    if result == 'created':
                        created_count += 1
                    elif result == 'updated':
                        updated_count += 1
                    else:
                        skipped_count += 1
            except Exception:
                skipped_count += 1
                continue
    
        return {'created': created_count, 'updated': updated_count, 'skipped': skipped_count}
    
    def _sync_product_taxes(self, taxes_data, tax_type):
        """
        Synchronize taxes from OmniCommerce and return list of tax IDs.
        
        taxes_data: List of tax dictionaries from OmniCommerce
        tax_type: 'sale' or 'purchase' to determine tax type
            
        List of tax IDs that can be used in Odoo
        """
        if not taxes_data:
            return []
        
        tax_ids = []
        
        for tax_data in taxes_data:
            try:
                tax_id = self._find_or_create_tax(tax_data, tax_type)
                if tax_id:
                    tax_ids.append(tax_id)
            except Exception as e:
                _logger.error(f"Error syncing tax {tax_data.get('name', 'Unknown')}: {str(e)}")
                continue
        
        return tax_ids

    def _find_or_create_tax(self, tax_data, tax_type):
        """
        Find existing tax or create new one based on tax data from OmniCommerce.
        
        tax_data: Dictionary containing tax information
        tax_type: 'sale' or 'purchase'
            
        Tax ID if found/created, None otherwise
        """
        tax_name = tax_data.get('name')
        tax_amount = tax_data.get('amount', 0.0)
        tax_amount_type = tax_data.get('amount_type', 'percent')
        country_code = tax_data.get('country_id', {}).get('code', '')

        country = self.env['res.country'].search([('code', '=', country_code)], limit=1)
        if country:
            country_id = country.id
        else:
            country_id = None
        if not tax_name:
            return None

        # Map tax type
        type_tax_use = 'sale' if tax_type == 'sale' else 'purchase'
        
        # Try to find existing tax by name, amount, and type
        existing_tax = self.env['account.tax'].search([
            ('name', '=', tax_name),
            ('type_tax_use', '=', type_tax_use),
            ('company_id', '=', self.env.company.id)
        ], limit=1)
        
        if existing_tax:
            # if tax exisits update it!
            existing_tax.write({
                'amount': tax_amount,
                'tax_group_id': self._find_or_create_tax_group(tax_data.get('tax_group_id', {}), country_id),
                'amount_type': tax_amount_type,
                'type_tax_use': type_tax_use,
                'tax_scope': tax_data.get('tax_scope'),
                'active': tax_data.get('active', True),
                'description': tax_data.get('description', existing_tax.description),
                'sequence': tax_data.get('sequence', existing_tax.sequence),
                'price_include': tax_data.get('include_in_price', existing_tax.price_include),
            })
            return existing_tax.id

        # Create new tax if not found
        try:
            tax_group_id = self._find_or_create_tax_group(tax_data.get('tax_group_id', {}), country_id)
            
            # Handle country
            country_id = None
            country_data = tax_data.get('country_id', {})
            if country_data.get('code'):
                country = self.env['res.country'].search([('code', '=', country_data['code'])], limit=1)
                if country:
                    country_id = country.id

            tax_vals = {
                'name': tax_name,
                'amount': tax_amount,
                'amount_type': tax_amount_type,
                'type_tax_use': type_tax_use,
                'tax_scope': tax_data.get('tax_scope', 'consu'),
                'description': tax_data.get('description', tax_name),
                'sequence': tax_data.get('sequence', 1),
                'active': tax_data.get('active', True),
                'price_include': tax_data.get('include_in_price', False),
                'company_id': self.env.company.id,
            }
            
            if tax_group_id:
                tax_vals['tax_group_id'] = tax_group_id
            
            if country_id:
                tax_vals['country_id'] = country_id

            new_tax = self.env['account.tax'].create(tax_vals)
            return new_tax.id
            
        except Exception as e:
            _logger.error(f"Error creating tax {tax_name}: {str(e)}")
            return None

    def _find_or_create_tax_group(self, tax_group_data, country_id=None):
        """
        Find or create tax group based on data from OmniCommerce.
        
        tax_group_data: Dictionary containing tax group information
            
        Tax group ID if found/created, None otherwise
        """
        if not tax_group_data or not tax_group_data.get('name'):
            return None
        
        group_name = tax_group_data.get('name')
        
        # Try to find existing tax group
        existing_group = self.env['account.tax.group'].search([
            ('name', '=', group_name),
            ('company_id', '=', self.env.company.id)
        ], limit=1)
        
        if existing_group:
            # if both country_id are set and do not match, update the tax groups country id
            if country_id and existing_group.country_id and existing_group.country_id.id != country_id:
                existing_group.write({'country_id': country_id})
                return existing_group.id
        
        # Create new tax group
        vals = {
            'name': group_name,
            'company_id': self.env.company.id,
        }
        if country_id:
            vals['country_id'] = country_id
        
        try:
            new_group = self.env['account.tax.group'].create(vals)
            return new_group.id
        except Exception as e:
            _logger.error(f"Error creating tax group {group_name}: {str(e)}")
            return None

    
    # Helper method to sync a simple product
    # Not a complexity here, as we only need to check default_code
    def _sync_simple_product(self, product_data, company_id):
        """   
        Synchronize a simple (non-variant) product from OmniCommerce to Odoo.
        - Uses default_code as the unique identifier.
        - Updates the product template if it exists, otherwise creates a new one.
        - Skips the product if default_code is missing.
        """
        item_code = product_data.get('default_code')
        if not item_code:
            return 'skipped'
        
        # Sync taxes first
        customer_tax_ids = self._sync_product_taxes(product_data.get('taxes_id', []), 'sale')
        supplier_tax_ids = self._sync_product_taxes(product_data.get('supplier_taxes_id', []), 'purchase')
        
    
        template_vals = {
            'name': product_data.get('name'),
            'company_id': company_id,
            'list_price': product_data.get('list_price', 0.0),
            'type': product_data.get('type', 'product'),
            'tracking': product_data.get('tracking', 'none'),
            'sale_ok': product_data.get('sale_ok', True),
            'purchase_ok': product_data.get('purchase_ok', True),
            'weight': product_data.get('weight', 0.0),
            'volume': product_data.get('volume', 0.0),
            'default_code': item_code,
            'barcode': product_data.get('barcode'),
            'active': product_data.get('active', True),
            'taxes_id': [Command.set(customer_tax_ids)],
            'supplier_taxes_id': [Command.set(supplier_tax_ids)],
            'standard_price': product_data.get('standard_price', 0.0),
        }
    
        # Search for existing product template by default_code
        # If found, update it; otherwise, create a new one
        # Note: We assume default_code is unique for simple products 
        # but limit 1 to avoid multiple matches (they may exist)
        template = self.env['product.template'].search([('default_code', '=', item_code)], limit=1)
        if template:
            template.write(template_vals)
            return 'updated'
        else:
            template = self.env['product.template'].create(template_vals)
            return 'created'
    
    # Helper method to sync a product with variants
    # little complexity here, as we need to handle variants and attributes
    # Everything will be done based on default_code
    def _sync_variant_product(self, product_data, valid_variants, company_id):
        """
        Synchronize a product with variants from OmniCommerce to Odoo.
        - Only processes variants with a valid default_code.
        - Creates or updates the product template and its variants.
        """
        template_name = product_data.get('name')
        if not template_name:
            return 'skipped'
    
        # Only collect attribute values from valid variants
        variants_data = valid_variants if valid_variants is not None else product_data.get('variants', [])
        used_attribute_values = {}
    
        for variant_data in variants_data:
            variant_default_code = variant_data.get('default_code')
            if not variant_default_code:
                continue
            for attr_val_data in variant_data.get('product_template_attribute_value_ids', []):
                attr_name = attr_val_data.get('attribute_id', {}).get('name')
                attr_val_name = attr_val_data.get('name')
                if attr_name and attr_val_name:
                    used_attribute_values.setdefault(attr_name, set()).add(attr_val_name)
    
        # Improved template lookup logic
        # This was needed to avoid creating duplicate templates while there is change in name but not in variants
        template = self.env['product.template'].search([('name', '=', template_name)], limit=1)
        if not template:
            # Try to find a variant by default_code and use its template
            found_template = None
            for variant_data in variants_data:
                variant_default_code = variant_data.get('default_code')
                if not variant_default_code:
                    continue
                variant = self.env['product.product'].search([('default_code', '=', variant_default_code)], limit=1)
                if variant and variant.product_tmpl_id:
                    found_template = variant.product_tmpl_id
                    break
            if found_template:
                # if we found a variant with default_code, use its template
                # This avoids creating a new template if one already exists with atleast one variant and same default_code
                template = found_template
            else:
                template = None

        customer_tax_ids = self._sync_product_taxes(product_data.get('taxes_id', []), 'sale')
        supplier_tax_ids = self._sync_product_taxes(product_data.get('supplier_taxes_id', []), 'purchase')



        template_vals = {
            'name': template_name,
            'company_id': company_id,
            'list_price': product_data.get('list_price', 0.0),
            'type': product_data.get('type', 'product'),
            'tracking': product_data.get('tracking', 'none'),
            'sale_ok': product_data.get('sale_ok', True),
            'purchase_ok': product_data.get('purchase_ok', True),
            'weight': product_data.get('weight', 0.0),
            'volume': product_data.get('volume', 0.0),
            'active': product_data.get('active', True),
            'taxes_id': [Command.set(customer_tax_ids)],
            'supplier_taxes_id': [Command.set(supplier_tax_ids)],
            'standard_price': product_data.get('standard_price', 0.0),
        }
    
        if template:
            template.write(template_vals)
            action = 'updated'
        else:
            template = self.env['product.template'].create(template_vals)
            action = 'created'
    
        # Attribute and variant logic
        # find or create attributes and values
        attribute_lines_data = product_data.get('attribute_lines', [])
        for attr_line_data in attribute_lines_data:
            attribute_data = attr_line_data.get('attribute_id', {})
            attribute_name = attribute_data.get('name')
            if not attribute_name or attribute_name not in used_attribute_values:
                continue
            attribute = self.env['product.attribute'].search([('name', '=', attribute_name)], limit=1)
            if not attribute:
                attribute = self.env['product.attribute'].create({
                    'name': attribute_name,
                    'display_type': attribute_data.get('display_type', 'radio'),
                    'create_variant': attribute_data.get('create_variant', 'always'),
                })
            values_data = attr_line_data.get('value_ids', [])
            value_ids = []
            for value_data in values_data:
                value_name = value_data.get('name')
                if not value_name or value_name not in used_attribute_values[attribute_name]:
                    continue
                attr_value = self.env['product.attribute.value'].search([
                    ('name', '=', value_name),
                    ('attribute_id', '=', attribute.id)
                ], limit=1)
                if not attr_value:
                    attr_value = self.env['product.attribute.value'].create({
                        'name': value_name,
                        'attribute_id': attribute.id,
                        'html_color': value_data.get('html_color'),
                        'is_custom': value_data.get('is_custom', False),
                    })
                value_ids.append(attr_value.id)
            if not value_ids:
                continue
            existing_line = self.env['product.template.attribute.line'].search([
                ('product_tmpl_id', '=', template.id),
                ('attribute_id', '=', attribute.id)
            ], limit=1)
            if existing_line:
                # existing_line.write({'value_ids': [(6, 0, value_ids)]})
                existing_line.write({'value_ids': [Command.set(value_ids)]})
            else:
                self.env['product.template.attribute.line'].create({
                    'product_tmpl_id': template.id,
                    'attribute_id': attribute.id,
                    # 'value_ids': [(6, 0, value_ids)]
                    'value_ids': [Command.set(value_ids)],
                })
    
        # Variant creation or update
        for variant_data in variants_data:
            variant_default_code = variant_data.get('default_code')
            if not variant_default_code:
                continue
    
            variant_attr_values = variant_data.get('product_template_attribute_value_ids', [])
            if not variant_attr_values:
                continue
    
            template_attr_value_ids = []
            for attr_val_data in variant_attr_values:
                attr_name = attr_val_data.get('attribute_id', {}).get('name')
                attr_val_name = attr_val_data.get('name')
                if attr_name and attr_val_name:
                    attribute = self.env['product.attribute'].search([('name', '=', attr_name)], limit=1)
                    if attribute:
                        attr_value = self.env['product.attribute.value'].search([
                            ('name', '=', attr_val_name),
                            ('attribute_id', '=', attribute.id)
                        ], limit=1)
                        if attr_value:
                            tmpl_attr_value = self.env['product.template.attribute.value'].search([
                                ('product_tmpl_id', '=', template.id),
                                ('attribute_id', '=', attribute.id),
                                ('product_attribute_value_id', '=', attr_value.id)
                            ], limit=1)
                            if tmpl_attr_value:
                                template_attr_value_ids.append(tmpl_attr_value.id)
    
            existing_variant = None
            for variant in template.product_variant_ids:
                if set(variant.product_template_attribute_value_ids.ids) == set(template_attr_value_ids):
                    existing_variant = variant
                    break
    
            variant_vals = {
                'default_code': variant_default_code,
                'barcode': variant_data.get('barcode'),
                'active': variant_data.get('active', True),
                'weight': variant_data.get('weight', 0.0),
                'volume': variant_data.get('volume', 0.0),
                'standard_price': variant_data.get('standard_price', 0.0),
            }
    
            if existing_variant:
                existing_variant.write(variant_vals)
            else:
                if template_attr_value_ids:
                    combination = self.env['product.template.attribute.value'].browse(template_attr_value_ids)
                    new_variant = template._get_variant_for_combination(combination)
                    if new_variant:
                        new_variant.write(variant_vals)
    
        return action
    
    @api.model
    def receive_inventory_data(self, inventory_data):
        """
            Receives inventory data in JSON format from odoo instance and updates 
            inventory here in omnicommerce.
        """
        if not inventory_data:
            return {"status": "error", "message": "No inventory data to process."}
        
        products_updated = 0
        lots_updated = 0

        for product_data in inventory_data:
            product = self.env['product.product'].search([('default_code', '=', product_data.get('default_code'))], limit=1)
            if not product:
                continue

            products_updated += 1

            tracking = product_data.get('tracking')
            stock_quants_data = product_data.get('stock_quants', [])

            if tracking == 'none' or tracking is None:
                self._sync_stock_normal_quants(product, product_data)
            else:
                
                lots_updated += self._sync_stock_lots_serial_quants(product, product_data, stock_quants_data)
        return {
            'updated': products_updated,
            'lots_updated': lots_updated
        }

    def _sync_stock_normal_quants(self, product, product_data):
        """
        Sync normal stock quants (no lots/serials) for a product.
        """
        # update product fields
        product.write({
            'qty_available': product_data.get('qty_available', 0.0),
            'tracking': product_data.get('tracking', 'none'),
            'is_storable': product_data.get('is_storable', False),
            'incoming_qty': product_data.get('incoming_qty', 0.0),
            'outgoing_qty': product_data.get('outgoing_qty'),
            'use_expiration_date': product_data.get('use_expiration_date'),
            'expiration_time': product_data.get('expiration_time'),
            'use_time': product_data.get('use_time'),
            'removal_time': product_data.get('removal_time'),
            'alert_time': product_data.get('alert_time'),
        })
        
    def _sync_stock_lots_serial_quants(self, product, product_data, stock_quants_data):
        """
        Sync stock quants with lots/serials for a product.
        """

        lots_updated = 0

        product.write({
            'tracking': product_data.get('tracking', 'none'),
            'is_storable': product_data.get('is_storable', False),
            'incoming_qty': product_data.get('incoming_qty', 0.0),
            'outgoing_qty': product_data.get('outgoing_qty'),
            'use_expiration_date': product_data.get('use_expiration_date'),
            'expiration_time': product_data.get('expiration_time'),
            'use_time': product_data.get('use_time'),
            'removal_time': product_data.get('removal_time'),
            'alert_time': product_data.get('alert_time'),
        })
        for quant_data in stock_quants_data:
            lot_info = quant_data.get('lot_info')
            if not lot_info:
                continue

            # Location
            location_name = lot_info.get('location_name')
            if location_name:
                location = self.env['stock.location'].search([
                    ('name', '=', location_name),
                    ('company_id', '=', self.env.company.id)
                ], limit=1)
                if not location:
                    location = self.env['stock.location'].create({
                        'name': location_name,
                        'usage': 'internal',
                        'company_id': self.env.company.id,
                    })
            else:
                location = self.env['stock.location'].search([
                    ('usage', '=', 'internal'),
                    ('company_id', '=', self.env.company.id)
                ], limit=1)
            if not location:
                continue

            # Lot
            lot_ref = lot_info.get('lot_ref') or lot_info.get('name')
            if not lot_ref:
                continue
            lot = self.env['stock.lot'].search([
                ('ref', '=', lot_ref),
                ('product_id', '=', product.id),
                ('company_id', '=', product.company_id.id),
            ], limit=1)
            if not lot:
                lot = self.env['stock.lot'].create({
                    'name': lot_info.get('name') or lot_ref,
                    'ref': lot_ref,
                    'product_id': product.id,
                    'company_id': product.company_id.id,
                })
                
            if product.use_expiration_date:
                lot_dates = {}
                for date_field in ['expiration_date', 'removal_date', 'use_date', 'alert_date']:
                    if lot_info.get(date_field):
                        lot_dates[date_field] = fields.Datetime.from_string(lot_info[date_field].replace('T', ' '))
                if lot_dates:
                    lot.write(lot_dates)

            target_qty = quant_data.get('quantity', 0.0)
            reserved_qty = quant_data.get('reserved_quantity', 0.0)
            quant = self.env['stock.quant'].search([
                ('product_id', '=', product.id),
                ('location_id', '=', location.id),
                ('lot_id', '=', lot.id)
            ], limit=1)
            if quant:
                quant.write({
                    'quantity': target_qty,
                    'reserved_quantity': reserved_qty,
                })
            else:
                self.env['stock.quant'].create({
                    'product_id': product.id,
                    'location_id': location.id,
                    'lot_id': lot.id,
                    'quantity': target_qty,
                    'reserved_quantity': reserved_qty,
                    'company_id': self.env.company.id,
                })

            lots_updated += 1
        return lots_updated