from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo.tests import HttpCase, tagged

import json


@tagged('-at_install', 'post_install')
class TestAccountProductCatalog(AccountTestInvoicingCommon, HttpCase):

    def test_remove_product_from_catalog_without_move_line(self):
        """Test that removing a product from the account catalog right after clicking Add button"""
        self.authenticate(self.env.user.login, self.env.user.login)
        invoice = self.env['account.move'].create({
            'partner_id': self.partner_a.id,
        })
        resp = self.url_open(
            url='/product/catalog/update_order_line_info',
            data=json.dumps({
                'params': {
                    'child_field': 'order_line',
                    'order_id': invoice.id,
                    'product_id': self.product_a.id,
                    'quantity': 0,
                    'res_model': 'account.move'
                }
            }),
            headers={'Content-Type': 'application/json'},
        )

        self.assertFalse(invoice.line_ids)
        self.assertEqual(resp.json()['result'], self.product_a.standard_price)
