# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.addons.base.tests.common import BaseCommon
from odoo.addons.mail.tests.common import mail_new_test_user
from odoo.addons.uom.tests.common import UomCommon


class TestPurchaseRequisitionCommon(BaseCommon, UomCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.user_purchase_requisition_manager = mail_new_test_user(
            cls.env,
            name='Purchase requisition Manager',
            login='prm',
            email='requisition_manager@yourcompany.com',
            notification_type='inbox',
            groups='purchase.group_purchase_manager',
        )
        cls.user_purchase_requisition_user = mail_new_test_user(
            cls.env,
            name='Purchase requisition User',
            login='pru',
            email='requisition_user@yourcompany.com',
            notification_type='inbox',
            groups='purchase.group_purchase_user',
        )

        cls.product_09 = cls.env['product.product'].create({
            'name': 'Pedal Bin',
            'standard_price': 10.0,
            'list_price': 47.0,
            'type': 'consu',
            'default_code': 'E-COM10',
        })

        cls.product_13 = cls.env['product.product'].create({
            'name': 'Corner Desk Black',
            'standard_price': 78.0,
            'list_price': 85.0,
            'type': 'consu',
            'default_code': 'FURN_1118',
        })

        # In order to test process of the purchase requisition ,create requisition
        cls.bo_requisition = cls.env['purchase.requisition'].create({
            'line_ids': [(0, 0, {
                'product_id': cls.product_09.id,
                'product_qty': 10.0,
                'product_uom_id': cls.uom_unit.id,
            })]
        })
