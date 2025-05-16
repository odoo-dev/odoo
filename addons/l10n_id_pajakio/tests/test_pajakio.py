from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo.tests import tagged
from odoo.exceptions import ValidationError


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestPajakIO(AccountTestInvoicingCommon):
    
    @classmethod
    @AccountTestInvoicingCommon.setup_chart_template('id')
    def setUpClass(cls):
        super().setUpClass()
        cls.company.l10n_id_pajakio_api_key = 'dummy'
        cls.invoice = cls.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': cls.partner_a.id,
            'invoice_date': '2025-01-01',
            'invoice_line_ids': [(0, 0, {
                'product_id': cls.product_a.id,
                'quantity': 1,
                'price_unit': 100000.0,
                'tax_ids': cls.tax_sale_a.ids,
            })],
        })
        

    def test_l10n_id_pajakio_api_key_field(self):
        """Test the availability of the field l10n_id_pajakio_api_key."""
        # Ensure the field exists and
        self.assertTrue(hasattr(self.company, 'l10n_id_pajakio_api_key'), "Field 'l10n_id_pajakio_api_key' does not exist on company.")
        
        # Test setting a valid value
        self.company.l10n_id_pajakio_api_key = 'test_key'
        self.assertEqual(self.company.l10n_id_pajakio_api_key, 'test_key', "Field 'l10n_id_pajakio_api_key' did not retain the assigned value.")
        
        # Test validation error when the field is not set
        with self.assertRaises(ValidationError):
            self.company.l10n_id_pajakio_api_key = False
            self.invoice._pajakio_get_api_key_encoded()

    def test_pajakio_get_api_key_encoded(self):
        """Test the _pajakio_get_api_key_encoded method. Test case taken from 
            https://openapi-pajakio.readme.io/v1.9.1/reference/authentication"""
        self.company.l10n_id_pajakio_api_key = '5289b2c5a69a1f4ca114d5f439539658ad2d14ed78759d3f0e1e5cfd291e13fc'
        encoded_key = self.invoice._pajakio_get_api_key_encoded()
        self.assertEqual(encoded_key, "NTI4OWIyYzVhNjlhMWY0Y2ExMTRkNWY0Mzk1Mzk2NThhZDJkMTRlZDc4NzU5ZDNmMGUxZTVjZmQyOTFlMTNmYw==")

    def test_submit_to_pajakio_success(self):
        """Test successful submission to PajakIO."""
        self.company.l10n_id_pajakio_api_key = 'valid_api_key'
        self.invoice.write({'state': 'draft'})
        
        # Mock the API response for successful submission
        with self.env.cr.savepoint(), self.patch('odoo.addons.l10n_id_pajakio.models.account_move.requests.post') as mock_post:
            mock_post.return_value.status_code = 200
            mock_post.return_value.json.return_value = {'transaction_id': '12345'}
            
            self.invoice.action_post()
            self.invoice._submit_to_pajakio()
            
            self.assertEqual(self.invoice.l10n_id_pajakio_transaction_id, '12345', "Transaction ID was not set correctly.")
            self.assertEqual(self.invoice.l10n_id_pajakio_status, 'submitted', "Invoice status was not updated to 'submitted'.")

    def test_submit_to_pajakio_failure(self):
        """Test failure during submission to PajakIO."""
        self.company.l10n_id_pajakio_api_key = 'valid_api_key'
        self.invoice.write({'state': 'draft'})
        
        # Mock the API response for failure
        with self.env.cr.savepoint(), self.patch('odoo.addons.l10n_id_pajakio.models.account_move.requests.post') as mock_post:
            mock_post.return_value.status_code = 400
            mock_post.return_value.json.return_value = {'error': 'Invalid data'}
            
            with self.assertRaises(ValidationError, msg="Expected ValidationError on submission failure."):
                self.invoice.action_post()
                self.invoice._submit_to_pajakio()
            
            self.assertFalse(self.invoice.l10n_id_pajakio_transaction_id, "Transaction ID should not be set on failure.")
            self.assertEqual(self.invoice.l10n_id_pajakio_status, 'error', "Invoice status should be 'error' on failure.")

    def test_submit_to_pajakio_no_api_key(self):
        """Test submission to PajakIO without API key."""
        self.company.l10n_id_pajakio_api_key = False
        self.invoice.write({'state': 'draft'})
        
        with self.assertRaises(ValidationError, msg="Expected ValidationError when API key is missing."):
            self.invoice.action_post()
            self.invoice._submit_to_pajakio()
        
        self.assertFalse(self.invoice.l10n_id_pajakio_transaction_id, "Transaction ID should not be set without API key.")
        self.assertEqual(self.invoice.l10n_id_pajakio_status, 'error', "Invoice status should be 'error' when API key is missing.")
        
# TODO
# discussion
# credit deducted based on approval by DJP ofor later
# implement reset to draft => remove transaction id and pajakio ( handle reset to draft flow) [done]
# failure reason when uploading => add field in form view [done]
# get_status returns "nofa" => put in account.move information as well [done]
# {{base_url}}/efaktur/v3/penjualan/batal => to cancel the transaction in pajakIO as well [done]
# ========================
# questions: 
# - cancel only possible if the transaction is already approved. If not approved yet, what will hapepen? ==> use update API instead
# - Once reset to draft, can't seem to re-submit things, maybe due to same reference number/name? 
# - Is there any API to update/delete? I can't find it in the documentation
# ===================
# user still needs NOFA + Transaction URL from faktur (after cancelled) + jenisFaktur => log note for historical proof
# highlight transaction failure reason (warning/error flagging)
# url clickable (no need for get pdf vat output)

# final question:
# if we cancel transaction successfully, is there still a way to update the transaction and re-submit it? (maybe using the `pengganti=True`)

# if cancel => simply reset all fields
# UI/UX addition for status
# Summary of transactions and nomer faktur  (dashboarding) + download pdf
# historical nofa depending on invoice
