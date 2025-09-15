# odoo module: OmniCommerce Server Addons

from odoo import models    


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    # Override create method to set company_id for each product template
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