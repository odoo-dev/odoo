from odoo.tests import tagged

from odoo.addons.learning.tests.test_lesson_tours import LessonTourCase


@tagged('post_install', '-at_install')
class TestProductLessonTours(LessonTourCase):

    def test_product_categories(self):
        self.play_checkpoint('product_categories', 'menu')
        product = self.env['product.template'].search([('name', '=', "Copper pipe 15mm")])
        self.assertEqual(product.categ_id.complete_name, "Plumbing / Pipes")

    def test_product_categories_from_the_product(self):
        self.play_checkpoint('product_categories', 'product')
        product = self.env['product.template'].search([('name', '=', "Copper pipe 15mm")])
        self.assertEqual(product.categ_id.complete_name, "Plumbing / Pipes")

    def test_menu_path(self):
        path = self.env['learning.setup']._menu_path('product.template')
        if not path:
            self.skipTest("No app with a product menu is installed")
        self.assertTrue(all(step['xmlid'] and step['name'] for step in path))
        menu = self.env.ref(path[-1]['xmlid'])
        self.assertEqual(menu.action.res_model, 'product.template')
        self.assertFalse(self.env.ref(path[0]['xmlid']).parent_id, "the path starts at an app")

    def test_setup_resets_the_category(self):
        Setup = self.env['learning.setup']
        location = Setup.run('product_categories', 'product')
        product = self.env['product.template'].search([('name', '=', "Copper pipe 15mm")])
        self.assertTrue(location['url'].endswith(f'/{product.id}'))
        product.categ_id = self.env['product.category'].create({'name': "Somewhere"})
        self.assertEqual(Setup.run('product_categories', 'product'), location)
        self.assertFalse(product.categ_id)
