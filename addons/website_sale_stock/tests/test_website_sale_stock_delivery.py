# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.exceptions import ValidationError
from odoo.tests import tagged

from odoo.addons.payment.tests.common import PaymentCommon
from odoo.addons.website_sale.controllers.delivery import Delivery
from odoo.addons.website_sale.tests.common import WebsiteSaleCommon, mock_website_sale_request


@tagged('post_install', '-at_install')
class TestWebsiteSaleStockDeliveryController(PaymentCommon, WebsiteSaleCommon):

    def setUp(self):
        super().setUp()
        self.Controller = Delivery()

    def test_validate_payment_with_no_available_delivery_method(self):
        """
        An error should be raised if you try to validate an order with a storable
        product without any delivery method available
        """
        storable_product = self.env['product.product'].create({
            'name': 'Storable Product',
            'sale_ok': True,
            'is_storable': True,
            'website_published': True,
        })
        carriers = self.env['delivery.carrier'].search([])
        carriers.write({'website_published': False})

        website = self.website.with_user(self.public_user)
        with mock_website_sale_request(website.env, website=website, sale_order_id=self.empty_cart.id):
            self.Controller.cart_update_json(product_id=storable_product.id, add_qty=1)
            with self.assertRaises(ValidationError):
                self.Controller.shop_payment_validate()
