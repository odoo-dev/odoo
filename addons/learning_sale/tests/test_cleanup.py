from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestSaleCleanup(TransactionCase):

    def test_cleanup_removes_confirmed_orders_and_posted_invoices(self):
        if not self.env.company.chart_template:
            self.skipTest("Needs a chart of accounts on the current company")
        Setup = self.env['learning.setup']
        order = Setup._practice_quote()
        order.action_confirm()
        invoice = order._create_invoices()
        self.env['learning.practice.record'].register('account.move', invoice.ids)
        invoice.action_post()
        journal = invoice.journal_id
        self.assertEqual(journal.name, "Practice Sales")

        Practice = self.env['learning.practice.record']
        Practice.search([])._cleanup()

        self.assertFalse((order + invoice + journal).exists())
        self.assertFalse(Practice.search([]))
