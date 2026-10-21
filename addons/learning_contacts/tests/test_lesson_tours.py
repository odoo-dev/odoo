from odoo.tests import tagged

from odoo.addons.learning.tests.test_lesson_tours import LessonTourCase


@tagged('post_install', '-at_install')
class TestContactLessonTours(LessonTourCase):

    def _jean(self):
        return self.env['res.partner'].search([('name', '=', "Jean Dupont")])

    def test_first_customer(self):
        self.play_checkpoint('first_customer', 'start')
        customer = self.env['res.partner'].search([('name', '=', "Marie Lambert")])
        self.assertEqual(customer.email, "marie.lambert@example.com")

    def test_link_company(self):
        self.play_checkpoint('link_company', 'start')
        self.assertEqual(self._jean().parent_id.name, "Martin Heating")

    def test_search_more(self):
        self.play_checkpoint('search_more', 'start')
        self.assertEqual(self._jean().parent_id.name, "Roofing Ghent")

    def test_setups_are_idempotent(self):
        Setup = self.env['learning.setup']
        Setup.run('search_more', 'start')
        count = self.env['res.partner'].search_count([])
        Setup.run('search_more', 'start')
        self.assertEqual(self.env['res.partner'].search_count([]), count)
