# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import Command
from odoo.tests.common import tagged
from odoo.addons.account.tests.test_account_move_send import TestAccountMoveSendCommon

from freezegun import freeze_time


@tagged('post_install_l10n', '-at_install', 'post_install')
class L10nHuEdiTestFlowsMocked( TestAccountMoveSendCommon):
    """ Test the Hungarian EDI flows using mocked data from the test servers. """
    @classmethod
    def setUpClass(cls):
        with freeze_time('2024-01-25T15:28:53Z'):
            super().setUpClass()

    def test_invoice_line_currency_rate_from_sale(self):
        currency = self.setup_other_currency('HRK', rates=[
            ('2016-01-01', 3.0),
            ('2017-01-01', 2.0),
        ])
        pricelist = self.env['product.pricelist'].create({
            'name': 'Foreign pricelist',
            'currency_id': currency.id,
        })

        sale_order = self.env['sale.order'].create({
            'partner_id': self.partner_company.id,
            'partner_invoice_id': self.partner_company.id,
            'pricelist_id': pricelist.id,
            'order_line': [Command.create({
                'product_id': self.product.id,
                'product_uom_qty': 1,
                'price_unit': 600,
            })],
            'currency_id': currency.id,
            'date_order': '2017-01-01',
        })
        sale_order.action_confirm()

        delivery = sale_order.picking_ids
        delivery.button_validate()
        delivery.date_done = '2016-01-01'

        invoice = sale_order._create_invoices()
        self.assertRecordValues(invoice.line_ids, [
            {'amount_currency': -600.00,   'balance': -200.00},
            {'amount_currency': -162.00,   'balance': -54.00},
            {'amount_currency': 762.00,    'balance': 254.00},
        ])

