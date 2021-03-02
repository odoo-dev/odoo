# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.exceptions import UserError
from odoo.tests import tagged
from odoo.tools import mute_logger

from odoo.addons.payment import utils as payment_utils

from .common import AdyenCommon


@tagged('post_install', '-at_install')
class AdyenForm(AdyenCommon):

    def test_processing_values(self):
        tx = self.create_transaction(flow='direct')
        with mute_logger('odoo.addons.payment.models.payment_transaction'):
            processing_values = tx._get_processing_values()

        converted_amount = 111111
        self.assertEqual(
            payment_utils.to_minor_currency_units(self.amount, self.currency),
            converted_amount,
        )
        self.assertEqual(processing_values['converted_amount'], converted_amount)
        self.assertTrue(payment_utils.check_access_token(
            processing_values['access_token'],
            self.db_secret,
            self.reference,
            converted_amount,
            self.partner.id
        ))

    def test_token_activation(self):
        """Activation of disabled adyen tokens is forbidden"""
        token = self.create_token(active=False)
        with self.assertRaises(UserError):
            token._handle_reactivation_request()
