from openerp.addons.mail.tests.common import TestMail
from openerp.exceptions import Warning
from openerp.tools import float_compare

class TestAccountSupplierInvoice(TestMail):

    def setUp(self):
        super(TestAccountSupplierInvoice, self).setUp()

    def test_supplier_invoice(self):
        tax = self.env['account.tax'].create({
            'name': 'Tax 10.0',
            'amount': 10.0,
            'amount_type': 'fixed',
        })

        # Should be changed by automatic on_change later
        invoice_account = self.env['account.account'].search([('user_type', '=', self.env.ref('account.data_account_type_receivable').id)])[0].id
        invoice_line_account = self.env['account.account'].search([('user_type', '=', self.env.ref('account.data_account_type_expenses').id)])[0].id

        invoice = self.env['account.invoice'].create({'partner_id': self.env.ref('base.res_partner_2').id,
            'account_id': invoice_account,
            'type': 'in_invoice',
        })

        self.env['account.invoice.line'].create({'product_id': self.env.ref('product.product_product_4').id,
            'quantity': 1.0,
            'price_unit': 100.0,
            'invoice_id': invoice.id,
            'name': 'product that cost 100',
            'account_id': invoice_line_account,
            'invoice_line_tax_id':[(6, 0, [tax.id])],
        })

        # check that Initially supplier bill state is "Draft"
        self.assertTrue((invoice.state == 'draft'), "Initially supplier bill state is Draft")

        #change the state of invoice to open by clicking Validate button
        invoice.signal_workflow('invoice_open')

        #I cancel the account move which is in posted state and verifies that it gives warning message
        with self.assertRaises(Warning):
            invoice.move_id.button_cancel()
