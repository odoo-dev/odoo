from odoo import models, api


class SaleOrder(models.Model):
    _inherit = "sale.order"

    @api.model
    def get_orders_data(self, company_id, since_date=None):
        """
            This method returns a structured JSON data for all sale orders along with its
            related fields like sale order lines, customer, delivery/picking info etc.
            
            This method will be called via jsonrpc from odoo instance to pull sale order data
            from omnicommece
        """
        orders = self.env['sale.order'].search([
            ('company_id', '=', company_id),
            ('write_date', '>=', since_date) if since_date else ('write_date', '!=', False)
        ])
        
        orders_json = []
        for order in orders:
            order_json = self._get_order_json(order)
            orders_json.append(order_json)
        return orders_json

    def _get_order_json(self, order):
        """
        Returns structured JSON for a sale order with all related data
        """
        delivery_data = self._get_delivery_data(order)
        
        return {
            "id": order.id,
            "name": order.name,
            "date_order": order.date_order if order.date_order else None,
            "state": order.state,
            "amount_total": order.amount_total,
            "amount_untaxed": order.amount_untaxed,
            "amount_tax": order.amount_tax,
            "note": order.note,
            "client_order_ref": order.client_order_ref,
            "delivery": delivery_data,
            "delivery_set": order.delivery_set,
            "partner_id": {
                "id": order.partner_id.id,
                "name": order.partner_id.name,
                "email": order.partner_id.email,
                "phone": order.partner_id.phone,
                "is_company": order.partner_id.is_company,
                "function": order.partner_id.function,
                "vat": order.partner_id.vat,
                "lang": order.partner_id.lang,
                "street": order.partner_id.street,
                "street2": order.partner_id.street2,
                "city": order.partner_id.city,
                "zip": order.partner_id.zip,
                "company_registry": order.partner_id.company_registry,
                "ref": order.partner_id.ref,
                "state_id": {
                    "id": order.partner_id.state_id.id,
                    "name": order.partner_id.state_id.name,
                    "code": order.partner_id.state_id.code,
                } if order.partner_id.state_id else None,
                "country_id": {
                    "id": order.partner_id.country_id.id,
                    "name": order.partner_id.country_id.name,
                    "code": order.partner_id.country_id.code,
                } if order.partner_id.country_id else None,
                "category_id": [
                    {"id": cat.id, "name": cat.name}
                    for cat in order.partner_id.category_id
                ]
            } if order.partner_id else None,
            "team_id": {
                "id": order.team_id.id,
                "name": order.team_id.name,
            } if order.team_id else None,
            "company_id": {
                "id": order.company_id.id,
                "name": order.company_id.name,
            } if order.company_id else None,
            "order_line": [
                {
                    "id": line.id,
                    "name": line.name,
                    "product_uom_qty": line.product_uom_qty,
                    "price_unit": line.price_unit,
                    "discount": line.discount,
                    "price_subtotal": line.price_subtotal,
                    "price_total": line.price_total,
                    "product_sku": line.product_id.default_code,
                    "is_delivery": line.is_delivery,
                    "product_id": {
                        "id": line.product_id.id,
                        "name": line.product_id.name,
                        "default_code": line.product_id.default_code,
                        "type": line.product_id.type,
                        "list_price": line.product_id.list_price,
                        "barcode": line.product_id.barcode,
                        "active": line.product_id.active,
                        "weight": line.product_id.weight,
                        "volume": line.product_id.volume,
                        "tracking": line.product_id.tracking,
                        "has_variants": len(line.product_id.product_tmpl_id.product_variant_ids) > 1,
                        "attribute_lines": self._get_product_attribute_lines_json(line.product_id.product_tmpl_id) if len(line.product_id.product_tmpl_id.product_variant_ids) > 1 else [],
                        "variants": self._get_product_variants_json(line.product_id.product_tmpl_id) if len(line.product_id.product_tmpl_id.product_variant_ids) > 1 else [],
                        "taxes_id": [
                        {
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
                                "name": tax.tax_group_id.name
                            } if tax.tax_group_id else None,
                            "country_id": {
                                "name": tax.country_id.name,
                                "code": tax.country_id.code
                            } if tax.country_id else None
                        }
                        for tax in line.tax_ids
                    ],
                        # we will get supplier taxes from product only, not from order line as puschase tax data is not stored in sale order line
                        "supplier_taxes_id": [
                                {
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
                                        "name": tax.tax_group_id.name
                                    } if tax.tax_group_id else None,
                                    "country_id": {
                                        "name": tax.country_id.name,
                                        "code": tax.country_id.code
                                    } if tax.country_id else None
                                }
                                for tax in line.product_id.supplier_taxes_id
                            ],

                    } if line.product_id else None,
                }
                for line in order.order_line
            ]
        }

    def _get_delivery_data(self, order):
        """
        Get delivery/picking data for the order
        """
        # Find the delivery picking
        picking = self.env['stock.picking'].search([
            ('origin', '=', order.name),
            ('picking_type_code', '=', 'outgoing'),
            ('sale_id', '=', order.id)
        ], limit=1)
        
        if not picking:
            return {}
        
        return {
            "picking_id": picking.id,
            "name": picking.name,
            "state": picking.state,
            "carrier_id": {
                "id": picking.carrier_id.id,
                "name": picking.carrier_id.name,
            } if picking.carrier_id else None,
            "carrier_tracking_ref": picking.carrier_tracking_ref,
            "user_id": {
                "id": picking.user_id.id,
                "name": picking.user_id.name,
                "login": picking.user_id.login,
            } if picking.user_id else None,
            "scheduled_date": picking.scheduled_date if picking.scheduled_date else None,
            "date_done": picking.date_done if picking.date_done else None,
            "moves": [
                {
                    "id": move.id,
                    "product_code": move.product_id.default_code,
                    "product_name": move.product_id.name,
                    "state": move.state,
                    "carrier_id": {
                        "id": move.carrier_id.id,
                        "name": move.carrier_id.name,
                    } if hasattr(move, 'carrier_id') and move.carrier_id else None,
                }
                for move in picking.move_ids
            ]
        }
    
    def _get_product_attribute_lines_json(self, product_template):
        """Get attribute lines data for a product template"""
        attribute_lines = []
        for line in product_template.attribute_line_ids:
            attribute_lines.append({
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
        return attribute_lines

    def _get_product_variants_json(self, product_template):
        """Get variants data for a product template"""
        variants = []
        for variant in product_template.product_variant_ids:
            if variant.default_code:  # Only include variants with default_code
                variants.append({
                    "id": variant.id,
                    "name": variant.name,
                    "default_code": variant.default_code,
                    "barcode": variant.barcode,
                    "active": variant.active,
                    "weight": variant.weight,
                    "volume": variant.volume,
                    "standard_price": variant.standard_price,
                    "product_template_attribute_value_ids": [
                        {
                            "id": val.id,
                            "name": val.name,
                            "attribute_id": {
                                "id": val.attribute_id.id,
                                "name": val.attribute_id.name,
                            }
                        }
                        for val in variant.product_template_attribute_value_ids
                    ]
                })
        return variants
