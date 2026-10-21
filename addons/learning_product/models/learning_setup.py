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

    def _products_menu_location(self, **params):
        return self._menu_location('product.template', 'product.product_template_action', PRODUCT_APPS, **params)

    def _setup_product_categories_menu(self):
        """Find the product through the menus, from wherever the learner is."""
        return self._products_menu_location(productName=self._practice_product().name)

    def _setup_product_categories_product(self):
        return self._form_location(self._practice_product(), 'product.product_template_action')

    def _setup_first_product_start(self):
        return self._products_menu_location()

    def _setup_copy_product_start(self):
        product = self._practice_record('product.template', {'name': self.env._("Copper pipe 15mm")})
        product.list_price = 8.5
        return self._form_location(product, 'product.product_template_action')

    def _setup_labour_service_start(self):
        return self.env['ir.actions.act_window']._for_xml_id('product.product_template_action')
