from odoo import fields, models, api
from odoo.exceptions import ValidationError


class ResCompany(models.Model):
    _inherit = 'res.company'

    odoo_dbuuid = fields.Char(string="Odoo ERP Database UUID", help="Unique identifier for identifying the Odoo database/instance/server")
    odoo_company = fields.Integer(string="Odoo ERP Company ID", help="Corresponding Company ID in the associated Odoo instance")
    odoo_user = fields.Integer(string="Odoo ERP User ID", help="User ID of the Odoo instance who created this company in OmniCommerce")

    _uniq_dbuuid_company = models.Constraint(
        'UNIQUE(odoo_dbuuid, odoo_company)',
        'The Odoo ERP Database UUID and corresponding Odoo ERP Company ID must be unique.'
    )
    _uniq_dbuuid_name_uniq = models.Constraint(
        'UNIQUE(odoo_dbuuid, name)',
        'The Odoo ERP Database UUID and OmniCommerce Company Name must be unique.'
    )

    @api.model
    def link_odoo_instance(self, odoo_dbuuid, odoo_company_id, omnicommerce_company_id, odoo_user_id):
        # company_to_update = self.env.company.sudo()
        accessible_companies = self.env.companies

        # First check if omnicommerce_company_id is in the accessible companies
        if omnicommerce_company_id not in accessible_companies.ids:
            return {
                'status': 'error',
                'message': 'Unable to Link, You do not have access to the specified OmniCommerce company.',
            }
        # Find the company based on omnicommerce_company_id
        company_to_update = self.env['res.company'].sudo().browse(omnicommerce_company_id)
        # No need to check if company_to_update exists will be already checked in above accessible_companies check

        # Check if the company is already linked to an Odoo instance    
        if company_to_update.odoo_dbuuid and company_to_update.odoo_company:
            return {
                'status': 'error',
                'message': 'This company is already linked to an Odoo instance.',
            }
        
        company_to_update.write({
            'odoo_dbuuid': odoo_dbuuid,
            'odoo_company': odoo_company_id,
            'odoo_user': odoo_user_id,
        })
        return {
            'status': 'success',
            'message': 'Odoo instance linked successfully.',
            'omnicommerce_company_id': company_to_update.id,
            'omnicommerce_company_name': company_to_update.name,
            'omnicommerce_user_id': self.env.user.id,
            'omnicommerce_dbname': self.env.cr.dbname,
        }

    @api.model
    def unlink_odoo_instance(self, omnicommerce_company_id):
        """
        Unlinks an Odoo instance from this Omnicommerce company.
        """
        company_to_update = self.env['res.company'].sudo().browse(omnicommerce_company_id)
        if not company_to_update:
            return {
                'status': 'error',
                'message': 'Company not found.',
            }
        company_to_update.write({
            'odoo_dbuuid':None,
            'odoo_company': None,
            'odoo_user': None,
        })
        return {
            'status': 'success',
            'message': 'Odoo instance unlinked successfully.',
        }
    
    def create(self, vals):
        if self.env.user._is_public():
            return super(ResCompany, self).create(vals)
        else:
            current_user = self.env.user
            if isinstance(vals, dict):
                data = [vals]
            else:
                data = vals
            for val in data:
                existing_company = self.env['res.company'].sudo().search([
                    ('name', '=', val.get('name')),
                    ('id', 'in', current_user.company_ids.ids)
                ], limit=1)
                if existing_company:
                    raise ValidationError(f"A company with the name '{val['name']}' already exists in your companies. Please choose a different name.")

        return super(ResCompany, self).create(vals)
    
    def write(self, vals):
        current_user = self.env.user
        current_company = self.env.company

        if isinstance(vals, dict):
            data = [vals]
        else:
            data = vals
        for val in data:
            existing_companies = self.env['res.company'].sudo().search([
                ('name', '=', val.get('name')),
                ('id', 'in', current_user.company_ids.ids),
                ('id', '!=', current_company.id)  # to enusre we dont check against itself
            ])
            if existing_companies:
                raise ValidationError(f"A company with the name '{val.get('name')}' already exists in your companies. Please choose a different name.")
        return super(ResCompany, self).write(vals)