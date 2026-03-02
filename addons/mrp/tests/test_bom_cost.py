# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tests import tagged
from odoo.tools import float_round, float_compare

from .common import TestBomCostOperationCommon


@tagged('post_install', '-at_install')
class TestBomCost(TestBomCostOperationCommon):
    def test_01_compute_price_operation_cost(self):
        self.assertEqual(self.bom_1.unit_cost, 0, "Initial cost of the Product should be 0")
        self.bom_1.action_update_product_cost_from_bom()
        # Total cost of Dining Table = (550) + Total cost of operations (321.25) = 871.25
        # byproduct have 1%+12% of cost share so the final cost is 757.99
        self.assertEqual(float_round(self.bom_1.unit_cost, precision_digits=2), 757.99)
        (self.bom_1 | self.bom_2).action_update_product_cost_from_bom()
        # Total cost of Dining Table = (718.75) + Total cost of all operations (321.25 + 25.52) = 1065.52
        # byproduct have 1%+12% of cost share so the final cost is 927
        self.assertEqual(float_compare(self.bom_1.unit_cost, 927, precision_digits=2), 0)
