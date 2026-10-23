# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime, timedelta

from odoo.addons.event_sale.tests.common import TestEventSaleCommon
from odoo.tests import tagged


@tagged('post_install', '-at_install')
class TestSaleOrderTransfer(TestEventSaleCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.event = cls.env['event.event'].create({
            'name': 'Transfer Event',
            'date_begin': datetime.today() + timedelta(days=5),
            'date_end': datetime.today() + timedelta(days=6),
            'allow_transfer': True,
            'allow_transfer_return': True,
            'event_ticket_ids': [(0, 0, {'name': 'Free', 'product_id': cls.event_product.id, 'price': 0})],
        })
        cls.order = cls.env['sale.order'].create({
            'partner_id': cls.event_customer.id,
            'order_line': [(0, 0, {
                'product_id': cls.event_product.id,
                'event_id': cls.event.id,
                'event_ticket_id': cls.event.event_ticket_ids.id,
                'product_uom_qty': 2,
                'price_unit': 0,
            })],
        })
        cls.order.action_confirm()
        cls.registrations = cls.order.order_line.registration_ids
        cls.transferred = cls.registrations[0]
        transfer = cls.env['event.registration.transfer']._action_request(cls.transferred, cls.event_customer2)
        transfer.action_accept()

    def test_cancel_order_warning(self):
        self.assertEqual(self.registrations.mapped('state'), ['open', 'open'])
        action = self.order.action_cancel()
        self.assertEqual(action['res_model'], 'sale.order.transfer.cancel')
        self.assertEqual(self.order.state, 'sale', "The order is not cancelled before confirmation")

        wizard = self.env[action['res_model']].with_context(action['context']).create({})
        self.assertEqual(wizard.registration_ids, self.transferred)
        wizard.action_cancel_order()
        self.assertEqual(self.order.state, 'cancel')
        self.assertEqual(self.transferred.state, 'cancel')

    def test_cancel_order_without_transfer(self):
        self.transferred.transfer_ids.action_return()
        self.assertNotIsInstance(self.order.action_cancel(), dict, "No warning without transferred tickets")
        self.assertEqual(self.order.state, 'cancel')

    def test_order_customer_change(self):
        new_customer = self.env['res.partner'].create({'name': 'New Customer'})
        self.order.partner_id = new_customer
        self.assertEqual(self.transferred.partner_id, self.event_customer2, "Transferred tickets keep their owner")
        self.assertEqual(self.registrations[1].partner_id, new_customer)

    def test_order_registrations_of_owner(self):
        self.assertEqual(self.transferred._get_event_registration_ids_from_order(), self.transferred.ids)
        self.assertEqual(self.registrations[1]._get_event_registration_ids_from_order(), self.registrations[1].ids)
