from odoo.tests import tagged
from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo.addons.point_of_sale.tests.test_frontend import TestTaxCommonPOS
from odoo.addons.l10n_ar.tests.common import TestAr


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestL10nARPos(TestTaxCommonPOS, TestAr):

    @classmethod
    @AccountTestInvoicingCommon.setup_country('ar')
    def setUpClass(cls):
        super().setUpClass()
        cls.product_iva_105.available_in_pos = True

    def test_l10n_ar_pos_flow(self):
        self.main_pos_config.with_user(self.pos_user).open_ui()
        self.start_pos_tour('test_l10n_ar_pos_flow')
        self.main_pos_config.current_session_id.order_ids
        self.assertEqual(len(self.main_pos_config.current_session_id.order_ids), 2)
        order1 = self.main_pos_config.current_session_id.order_ids[0]
        order2 = self.main_pos_config.current_session_id.order_ids[1]
        self.assertEqual(order1.amount_total, -1.11, "The total of the first order should be -1.11")
        self.assertEqual(order2.amount_total, 1.11, "The total of the second order should be 1.11")
