# Part of Odoo. See LICENSE file for full copyright and licensing details.
from datetime import date, datetime

from odoo import Command
from odoo.tests import Form, tagged

from odoo.addons.sale.tests.common import TestSaleCommon


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestL10nKrEdiSupplyDate(TestSaleCommon):

    @classmethod
    @TestSaleCommon.setup_country('kr')
    def setUpClass(cls):
        super().setUpClass()
        cls.goods = cls.env['product.product'].create({'name': 'Goods', 'is_storable': True, 'invoice_policy': 'delivery'})
        cls.service = cls.env['product.product'].create({'name': 'Service', 'type': 'service', 'invoice_policy': 'order'})

    def _create_order(self):
        order = self.env['sale.order'].create({
            'partner_id': self.partner_a.id,
            'order_line': [
                Command.create({'product_id': self.goods.id, 'product_uom_qty': 2}),
                Command.create({'product_id': self.service.id, 'product_uom_qty': 1}),
            ],
        })
        order.action_confirm()
        return order

    def _deliver(self, order, quantity, delivery_date):
        picking = order.picking_ids.filtered(lambda picking: picking.state not in ('done', 'cancel'))
        picking.move_ids.quantity = quantity
        action = picking.button_validate()
        if isinstance(action, dict):
            Form.from_action(self.env, action).save().process()
        picking.move_ids.date = delivery_date

    def test_supply_date_from_delivery(self):
        order = self._create_order()
        self._deliver(order, 2, datetime(2026, 11, 20, 16, 30))

        invoice = order._create_invoices()

        self.assertRecordValues(invoice.invoice_line_ids, [
            {'product_id': self.goods.id, 'l10n_kr_edi_supply_date': date(2026, 11, 21)},
            {'product_id': self.service.id, 'l10n_kr_edi_supply_date': False},
        ])
        self.assertFalse(invoice.copy().invoice_line_ids.filtered('l10n_kr_edi_supply_date'))

    def test_supply_date_from_latest_delivery(self):
        order = self._create_order()
        self._deliver(order, 1, datetime(2026, 11, 3, 1, 0))
        self._deliver(order, 1, datetime(2026, 11, 10, 1, 0))

        invoice = order._create_invoices()

        self.assertEqual(invoice.invoice_line_ids.mapped('l10n_kr_edi_supply_date'), [date(2026, 11, 10), False])

    def test_supply_date_ignores_return(self):
        order = self._create_order()
        order.picking_ids.picking_type_id.return_picking_type_id = False
        self._deliver(order, 2, datetime(2026, 11, 20, 16, 30))
        return_picking = order.picking_ids._create_return()
        return_picking.move_ids.write({'product_uom_qty': 1, 'quantity': 1})
        return_picking.button_validate()
        return_picking.move_ids.date = datetime(2026, 12, 2, 1, 0)

        invoice = order._create_invoices()

        self.assertEqual(invoice.invoice_line_ids.mapped('l10n_kr_edi_supply_date'), [date(2026, 11, 21), False])
