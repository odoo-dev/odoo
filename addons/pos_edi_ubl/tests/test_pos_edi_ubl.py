from lxml import etree

from odoo.tests import tagged

from odoo.addons.point_of_sale.tests.common import TestPoSCommon


@tagged('post_install', '-at_install')
class TestPosEdiUbl(TestPoSCommon):

    def setUp(self):
        super().setUp()
        self.config = self.basic_config
        self.product1 = self.create_product('Product 1', self.categ_basic, 10.0, 5)
        self.product2 = self.create_product('Product 2', self.categ_basic, 20.0, 10)

    def _export(self, order):
        xml, errors = self.env['pos.edi.xml.ubl_21']._export_pos_order(order)
        self.assertFalse(errors)
        return etree.fromstring(xml)

    def test_export_pos_order_and_refund(self):
        self.open_new_session()
        order = next(iter(self._create_orders([{
            'pos_order_lines_ui_args': [(self.product1, 2), (self.product2, 1, 10.0)],
            'customer': self.customer,
        }]).values()))
        tree = self._export(order)
        self.assertEqual(etree.QName(tree).localname, 'Invoice')
        self.assertEqual(tree.findtext('{*}UBLVersionID'), '2.1')
        self.assertEqual(tree.findtext('{*}ID'), order.name)
        self.assertEqual(tree.findtext('{*}InvoiceTypeCode'), '380')
        self.assertEqual(len(tree.findall('{*}InvoiceLine')), 2)
        total = tree.find('{*}LegalMonetaryTotal')
        self.assertAlmostEqual(float(total.findtext('{*}TaxInclusiveAmount')), order.amount_total)
        self.assertAlmostEqual(float(total.findtext('{*}PrepaidAmount')), order.amount_paid)
        self.assertAlmostEqual(float(total.findtext('{*}PayableAmount')), 0.0)

        refund = order._refund()
        self.env['pos.make.payment'].with_context(active_id=refund.id).create({
            'amount': refund.amount_total,
            'payment_method_id': self.cash_pm1.id,
        }).check()
        tree = self._export(refund)
        self.assertEqual(etree.QName(tree).localname, 'CreditNote')
        self.assertEqual(tree.findtext('{*}CreditNoteTypeCode'), '381')
        total = tree.find('{*}LegalMonetaryTotal')
        self.assertAlmostEqual(float(total.findtext('{*}TaxInclusiveAmount')), -refund.amount_total)
        self.assertAlmostEqual(float(total.findtext('{*}PayableAmount')), 0.0)
        self.assertTrue(all(float(q.text) > 0 for q in tree.iterfind('.//{*}CreditedQuantity')))
