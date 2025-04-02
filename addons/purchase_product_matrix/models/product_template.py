from odoo import models, api


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    @api.model
    def name_search(self, name='', domain=None, operator='ilike', limit=100):
        """
        Returns the products in a prioritized sequence for the purchase order line product selection.
        First, it lists all products that have been invoiced to the specified customer,
        sorted from the most recent to the oldest invoice date.
        Afterward, it includes the remaining products in their default order of display.
        """
        domain = domain or []
        if not name and self.env.context.get('partner_id') and self.env.context.get('is_purchase'):
            product_templates_id =  [item['product_tmpl_id'] for item in self.get_prioritized_product_and_time('purchase')[:limit]]
            prioritized_product_templates = self.browse(product_templates_id)
            remaining_product_templates = self.search(
                [('id', 'not in', prioritized_product_templates.ids)] + domain,
                limit=limit - len(prioritized_product_templates)
            )
            product_templates = prioritized_product_templates + remaining_product_templates
            return [(product_template.id, product_template.display_name) for product_template in product_templates]
        else:
            return super().name_search(name, domain, operator, limit)
