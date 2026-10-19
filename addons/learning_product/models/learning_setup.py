from odoo import models

# Apps through which a tradesperson most likely reaches their products.
PRODUCT_APPS = ('sale.sale_menu_root', 'stock.menu_stock_root', 'purchase.menu_purchase_root')


class LearningSetup(models.AbstractModel):
    _inherit = 'learning.setup'

    def _practice_product(self):
        product = self._practice_record('product.template', {'name': self.env._("Copper pipe 15mm")})
        # the lesson starts from a product that is not in any category yet
        product.categ_id = False
        return product

    def _setup_product_categories_menu(self):
        """Find the product through the menus, from wherever the learner is."""
        product = self._practice_product()
        menu_path = self._menu_path('product.template', PRODUCT_APPS)
        return {
            # without any menu leading to products, start from the product list
            'location': False if menu_path else self.env['ir.actions.act_window']._for_xml_id('product.product_template_action'),
            'params': {'menuPath': menu_path, 'productName': product.name},
        }

    def _setup_product_categories_product(self):
        return self._form_location(self._practice_product(), 'product.product_template_action')
