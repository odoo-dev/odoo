from odoo.addons.sale_stock.tests.common import TestSaleStockCommon
from odoo.tests import tagged


@tagged('post_install', '-at_install')
class TestSaleStockMultiSalePicking(TestSaleStockCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.vendor = cls.env['res.partner'].create({
            'name': 'Test Vendor',
            'is_company': True,
            'supplier_rank': 1,
        })
        cls.customer = cls.env['res.partner'].create({
            'name': 'Test Customer',
            'is_company': True,
            'customer_rank': 1,
        })
        cls.dropship_route = cls.env.ref('stock_dropshipping.route_drop_shipping')
        cls.dropshiped_product = cls.env['product.product'].create({
            'name': 'Dropshiped Product',
            'type': 'consu',
            'is_storable': True,
            'seller_ids': [(0, 0, {
                'partner_id': cls.vendor.id,
                'min_qty': 1,
                'price': 50.0,
                'delay': 1,
            })],
            'route_ids': cls.dropship_route.ids,
        })

    def test_picking_with_multiple_sale_orders(self):
        # DropShip should be created on confirming PO with 2 sale orders
        self.vendor.group_rfq = "all"
        so1 = self.env['sale.order'].create({
            'partner_id': self.customer.id,
            'order_line': [
                (0, 0, {
                    'product_id': self.dropshiped_product.id,
                    'name': self.dropshiped_product.name,
                    'product_uom_qty': 2,
                    'price_unit': 200.0,
                })
            ],
        })
        so1.action_confirm()

        so2 = so1.copy()
        so2.action_confirm()

        action = so2.action_view_purchase_orders()
        po = self.env['purchase.order'].browse(action['res_id'])
        self.assertEqual(len(po.order_line), 2)
        self.assertTrue(po.button_confirm())
