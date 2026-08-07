# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class PosPaymentMethod(models.Model):
    _inherit = 'pos.payment.method'

    def _get_sale_order_payments(self, session):
        # Only the payments backed by an accounting payment have something to transfer.
        return super()._get_sale_order_payments(session).filtered('online_account_payment_id')

    def _get_settled_account_payment(self, payment):
        return payment.online_account_payment_id
