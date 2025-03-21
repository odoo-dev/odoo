from unittest import skipIf

from odoo.addons.point_of_sale.tests.test_frontend import TestPointOfSaleHttpCommon

from odoo.cli.populate import Populate
from odoo.tests.common import tagged
from odoo.tools import mute_logger

from odoo.tools import config



@skipIf(not config['test_local'], "This test is intended for local performance testing of POS with a large dataset.")
@tagged('pos_performance', 'post_install', '-at_install')
class TestPosPerformance(TestPointOfSaleHttpCommon):

    # Intentional failing test to verify the test is not running in a cloud environment
    def test_intentional_failure(self):
        self._skip_if_not_local()
        self.assertEqual(1, 2)

    def __populate_model(self, model_name, total_count):
        before_count = self.env[model_name].search_count([])
        populate_count = round(total_count / before_count) - 1
        Populate.populate(self.env, {model_name: populate_count}, 1)

        after_count = self.env[model_name].search_count([])
        print("====" * 25)
        print("Before Product Count: %s\nAfter Product Count: %s" % (before_count, after_count))
        print("====" * 25)

    @mute_logger('odoo.models.unlink', 'odoo.cli.populate', 'odoo.tools.populate', 'odoo.tests.common', 'werkzeug')
    def test_pos_session_opening(self):
        self.__populate_model('product.template', 5000)
        self.main_pos_config.with_user(self.pos_user).open_ui()
        self.start_tour("/pos/ui?config_id=%d" % self.main_pos_config.id, 'tourSessionOpening', login="pos_user", timeout=1000)
        self.main_pos_config.current_session_id.close_session_from_ui()
