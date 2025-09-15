import logging

from odoo import models, api, Command


_logger = logging.getLogger(__name__)


class ResPartner(models.Model):
    _inherit = "res.partner"

    # override create method to set company_id for each partner
    def create(self, vals_list):
        if isinstance(vals_list, dict):
            vals = vals_list
            if "company_id" not in vals or not vals["company_id"]:
                vals["company_id"] = self.env.company.id
            return super(ResPartner, self).create(vals)
        elif isinstance(vals_list, list):
            for vals in vals_list:
                if "company_id" not in vals or not vals["company_id"]:
                    vals["company_id"] = self.env.company.id
            return super(ResPartner, self).create(vals_list)
        else:
            raise ValueError("Invalid vals_list type: %s" % type(vals_list))
        
    @api.model
    def get_customers_data(self, company_id, since_date=None):
        """
        This method returns a structured JSON data for all customers along
        with its related fields

        This method will be called via jsonrpc from odoo instance to pull customers data
        from omnicommece
        """
        customers = self.env['res.partner'].search([
            ('company_id', '=', company_id),
            ('is_company', '=', False),  # Only individual customers (assuming that omnicommerce user only deals with customers not companies)
            ('write_date', '>=', since_date) if since_date else ('write_date', '!=', False),
            ('write_uid', '>', 1)  # Exclude data created by system
        ])

        customers_json = []
        for customer in customers:
            customer_json = self._get_customer_json(customer)
            customers_json.append(customer_json)
            
        return customers_json

    def _get_customer_json(self, customer):
        """
        Returns structured JSON for a customer with all related data
        """
        return {
            "id": customer.id,
            "name": customer.name,
            "email": customer.email,
            "phone": customer.phone,
            "is_company": customer.is_company,
            "function": customer.function,
            "vat": customer.vat,
            "lang": customer.lang,
            "street": customer.street,
            "street2": customer.street2,
            "city": customer.city,
            "zip": customer.zip,
            "company_registry": customer.company_registry,
            "ref": customer.ref,
            "active": customer.active,
            "state_id": {
                "id": customer.state_id.id,
                "name": customer.state_id.name,
                "code": customer.state_id.code,
            } if customer.state_id else None,
            "country_id": {
                "id": customer.country_id.id,
                "name": customer.country_id.name,
                "code": customer.country_id.code,
            } if customer.country_id else None,
            "category_id": [
                {"id": cat.id, "name": cat.name}
                for cat in customer.category_id
            ],
            "company_id": {
                "id": customer.company_id.id,
                "name": customer.company_id.name,
            } if customer.company_id else None,
        }

    @api.model
    def receive_customers_data(self, customers_data, company_id):
        """
        Process received customer data from OmniCommerce
        """
        created_count = 0
        updated_count = 0   
        skipped_count = 0
        for customer_data in customers_data:
            result = self._sync_customer(customer_data, company_id)
            if result == 'created':
                created_count += 1
            elif result == 'updated':
                updated_count += 1
            elif result == 'skipped':
                skipped_count += 1

        return {
            'created': created_count,
            'updated': updated_count,
            'skipped': skipped_count,
        }

    def _sync_customer(self, customer_data, company_id):
        """
        Synchronize a customer from OmniCommerce to Odoo.
        Uses phone -> email -> name matching priority.
        """
        customer_name = customer_data.get('name')
        customer_email = customer_data.get('email')
        customer_phone = customer_data.get('phone')
        
        if not customer_name:
            _logger.warning("Skipping customer - no name provided")
            return 'skipped'

        existing_customer = None
        
        # Try to match by phone/mobile first
        if customer_phone:
            existing_customer = self.env['res.partner'].search([('phone', '=', customer_phone)
            ], limit=1)
        
        # Try to match by email if no phone match
        if not existing_customer and customer_email:
            existing_customer = self.env['res.partner'].search([
                ('email', '=', customer_email)
            ], limit=1)
        
        # Try to match by name if no email match
        if not existing_customer:
            existing_customer = self.env['res.partner'].search([
                ('name', '=', customer_name)
            ], limit=1)

        #  Prepare customer values 
        customer_vals = {
            'name': customer_name,
            'email': customer_email,
            'phone': customer_phone,
            'is_company': customer_data.get('is_company', False),
            'function': customer_data.get('function'),
            'vat': customer_data.get('vat'),
            'lang': customer_data.get('lang'),
            'street': customer_data.get('street'),
            'street2': customer_data.get('street2'),
            'city': customer_data.get('city'),
            'zip': customer_data.get('zip'),
            'company_registry': customer_data.get('company_registry'),
            'ref': customer_data.get('ref'),
            'company_id': company_id,
        }

        # Handle state and country
        if customer_data.get('state_id'):
            state = self.env['res.country.state'].search([
                ('name', '=', customer_data['state_id'].get('name'))
            ], limit=1)
            if state:
                customer_vals['state_id'] = state.id

        if customer_data.get('country_id'):
            country = self.env['res.country'].search([
                ('code', '=', customer_data['country_id'].get('code'))
            ], limit=1)
            if country:
                customer_vals['country_id'] = country.id

        # Handle customer categories
        if customer_data.get('category_id'):
            category_ids = []
            for category_data in customer_data['category_id']:
                category = self.env['res.partner.category'].search([
                    ('name', '=', category_data.get('name'))
                ], limit=1)
                if not category:
                    category = self.env['res.partner.category'].create({
                        'name': category_data.get('name')
                    })
                category_ids.append(category.id)
            # customer_vals['category_id'] = [(6, 0, category_ids)]
            customer_vals['category_id'] = Command.set(category_ids)

        #  Create or update customer 
        if existing_customer:
            existing_customer.write(customer_vals)
            return 'updated'
        else:
            customer = self.env['res.partner'].create(customer_vals)
            return 'created'

