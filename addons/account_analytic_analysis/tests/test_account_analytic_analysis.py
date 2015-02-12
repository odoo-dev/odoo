from openerp.tests.common import TransactionCase
from openerp.tools import float_compare

class AnalyticAccountTest(TransactionCase):

    def setUp(self):
    	super(AnalyticAccountTest, self).setUp()

    def test_account_analytic_analysis(self):
    	#In order to test Contract Recurrent Invoice I create a new Contract Template
        line_data = [
            (0, 0,
                {
    		       	'product_id': self.env.ref('product.product_product_consultant').id,
                    'uom_id': self.env.ref('product.product_uom_hour').id,
                    'quantity': 2.0,
    		        'price_unit': 75.0,
    		        'name': 'Database Administration',
                }
             )
         ]
        contract_template = self.env['account.analytic.account'].create(dict(
    		name= 'Maintenance of Servers',
    	    company_id = self.env.ref('base.main_company').id,
    	    partner_id = self.env.ref('base.main_partner').id,
    	    type = 'template',
    	    recurring_invoices = True,
    	    recurring_interval = 1,
    	    recurring_invoice_line_ids = line_data
        	))

        #I create a contract based on this template

        contract_main = self.env['account.analytic.account'].create(dict(
    		partner_id = self.env.ref('base.main_partner').id,
    		template_id = contract_template.id,
    		type = 'contract',
            name = "Test Contract Main",
            recurring_invoices = True,
    		))

         #I check that the contract inherited from data of the template
        self.assertEquals(contract_template.recurring_interval, contract_main.recurring_interval, "The recurring interval of the contract does not match with the contract template")
        self.assertEquals(contract_template.recurring_invoices, contract_main.recurring_invoices, "Invoice method of contract does not match with the contract template")

         #I generate all invoices from contracts having recurring invoicing
        inv_id = contract_template.recurring_create_invoice()[0]

         # I test the generated invoice
        #inv_ids = self.env['account.invoice'].search([('invoice_line.account_analytic_id','=',contract_template.id)], limit=1)
        self.assertTrue(len(inv_id)==1, "No invoice created for the contract")
       	assert float_compare(inv_id.amount_untaxed, 150.0, precision_digits=2) == 0, "The invoice total is different than 150!"

    	
