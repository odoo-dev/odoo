# -*- coding: utf-8 -*-

from odoo.tests import tagged
from odoo.addons.point_of_sale.tests.test_frontend import TestPointOfSaleHttpCommon
import logging

_logger = logging.getLogger(__name__)

@tagged('post_install', '-at_install')
class TestServiceCharge(TestPointOfSaleHttpCommon):

    @classmethod
    def setUpClass(cls):
        _logger.info("Setting up TestServiceCharge")
        super().setUpClass()
        cls.service_charge_product = cls.env.ref('pos_service_charge.product_product_service_charge')
        cls.test_product = cls.env['product.product'].create({
            'name': 'Test Product',
            'list_price': 100,
            'available_in_pos': True,
            'taxes_id': False, # Default no tax
        })

        # Configure POS to use Service Charge
        cls.main_pos_config.write({
            'service_charge_rate': 10.0,
            'service_charge_product_id': cls.service_charge_product.id,
            'service_charge_calculation_method': 'before_discount',
        })

    def test_orders_hk(self):
        """ Test Service Charge for Hong Kong (No Tax) """
        # HK has no VAT/GST, so just 10% SC
        # Product: 100
        # SC: 10
        # Total: 110

        self.main_pos_config.open_ui()
        self.start_pos_tour('pos_service_charge_hk')
