from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo.tests import tagged
from odoo.exceptions import ValidationError


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestPajakIO(AccountTestInvoicingCommon):
    
    @classmethod
    @AccountTestInvoicingCommon.setup_chart_template('id')
    def setUpClass(cls):
        cls.company_id.l10n_id_pajakio_api_key = 'dummy'

    def test_l10n_id_pajakio_api_key_field(self):
        """Test the availability of the field l10n_id_pajakio_api_key."""
        # Ensure the field exists and can be set
        self.assertTrue(hasattr(self.company_id, 'l10n_id_pajakio_api_key'), "Field 'l10n_id_pajakio_api_key' does not exist on company.")
        
        # Test setting a valid value
        self.company_id.l10n_id_pajakio_api_key = 'test_key'
        self.assertEqual(self.company_id.l10n_id_pajakio_api_key, 'test_key', "Field 'l10n_id_pajakio_api_key' did not retain the assigned value.")
        
        # Test validation error when the field is not set
        with self.assertRaises(ValidationError, msg="ValidationError not raised when 'l10n_id_pajakio_api_key' is missing."):
            self.company_id.l10n_id_pajakio_api_key = False
            self.company_id._check_pajakio_api_key()  # Assuming a method to validate the field exists

# TODO
# discussion
# credit deducted based on approval by DJP ofor later
# implement reset to draft => remove transaction id and pajakio ( handle reset to draft flow) [done]
# failure reason when uploading => add field in form view [done]
# get_status returns "nofa" => put in account.move information as well [done]
# {{base_url}}/efaktur/v3/penjualan/batal => to cancel the transaction in pajakIO as well [done]
# ========================
