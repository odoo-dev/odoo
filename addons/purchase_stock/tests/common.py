# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import timedelta

from odoo import fields
from odoo.fields import Command

from odoo.addons.mail.tests.common import mail_new_test_user
from odoo.addons.stock.tests.common import TestStockCommon


class PurchaseTestCommon(TestStockCommon):

    def _create_make_procurement(self, product, product_qty, date_planned=False):
        ProcurementGroup = self.env['procurement.group']
        order_values = {
            'warehouse_id': self.warehouse_1,
            'action': 'pull_push',
            'date_planned': date_planned or fields.Datetime.now() + timedelta(days=10),  # 10 days added to current date of procurement to get future schedule date and order date of purchase order.
            'group_id': self.env['procurement.group'],
        }
        return ProcurementGroup.run([self.env['procurement.group'].Procurement(
            product, product_qty, self.uom_unit, self.warehouse_1.lot_stock_id,
            product.name, '/', self.env.company, order_values)
        ])

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env.ref('stock.route_warehouse0_mto').active = True

        cls.route_buy = cls.warehouse_1.buy_pull_id.route_id.id
        cls.route_mto = cls.warehouse_1.mto_pull_id.route_id.id

        # Update product_1 with type, route and Delivery Lead Time
        cls.product_1.write({
            'is_storable': True,
            'route_ids': [Command.set([cls.route_buy, cls.route_mto])],
            'seller_ids': [Command.create({'partner_id': cls.partner.id, 'delay': 5})],
        })

        cls.t_shirt = cls.env['product.product'].create({
            'name': 'T-shirt',
            'description': 'Internal Notes',
            'route_ids': [Command.set([cls.route_buy, cls.route_mto])],
            'seller_ids': [Command.create({'partner_id': cls.partner.id, 'delay': 5})],
        })

        # Update product_2 with type, route and Delivery Lead Time
        cls.product_2.write({
            'route_ids': [Command.set([cls.route_buy, cls.route_mto])],
            'seller_ids': [Command.create({'partner_id': cls.partner.id, 'delay': 2})],
        })
        cls.res_users_purchase_user = mail_new_test_user(
            cls.env,
            name='Purchase User',
            login='pu',
            email='purchaseuser@yourcompany.com',
            notification_type='inbox',
            groups='purchase.group_purchase_user',
        )
