from odoo.tests import tagged
from odoo.addons.point_of_sale.tests.test_frontend import TestPointOfSaleHttpCommon

@tagged('post_install', '-at_install')
class TestPOSPartnerSearchMore(TestPointOfSaleHttpCommon):

    def test_01_pos_partner_list_search_more_with_sms(self):
        # the test should pass once with sms installed and another one with sms not installed
        self.start_tour(f"/pos/ui?config_id={self.main_pos_config.id}", 'partner_list_search_more_button_sms_module', login="pos_user")
        
