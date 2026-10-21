from odoo.tests import tagged

from odoo.addons.learning.tests.test_lesson_tours import LessonTourCase


@tagged('post_install', '-at_install')
class TestSaleLessonTours(LessonTourCase):

    def _practice_orders(self):
        Practice = self.env['learning.practice.record']
        return self.env['sale.order'].browse(Practice.search([('res_model', '=', 'sale.order')]).mapped('res_id'))

    def test_first_quote(self):
        self.play_checkpoint('first_quote', 'start')
        order = self.env['sale.order'].search([('partner_id.name', '=', "Jean Dupont")], order='id desc', limit=1)
        self.assertEqual(order.order_line.mapped('product_uom_qty'), [3, 2])

    def test_quote_sections(self):
        self.play_checkpoint('quote_sections', 'start')
        order = self._practice_orders().sorted('id')[-1]
        self.assertEqual(
            order.order_line.filtered('display_type').mapped('name'), ["Bathroom", "Kitchen"],
        )

    def test_document_life(self):
        self.play_checkpoint('document_life', 'start')
        order = self._practice_orders().sorted('id')[-1]
        self.assertEqual(order.state, 'sale')
        self.assertEqual(order.invoice_ids.state, 'posted')
        self.assertEqual(order.invoice_ids.journal_id.name, "Practice Sales")
        # adjusted while it was a draft: 3 hours of labour instead of 2
        labour_line = order.invoice_ids.invoice_line_ids.filtered(lambda line: line.product_id.type == 'service')
        self.assertEqual(labour_line.quantity, 3)
