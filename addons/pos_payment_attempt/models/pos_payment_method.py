# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class PosPaymentMethod(models.Model):
    _inherit = 'pos.payment.method'

    def _payment_attempt_check_status(self, attempt):
        """Ask the provider for the status of an attempt and log it with ``attempt._log_event``.

        Override in provider modules. Without an override the attempt is left unchanged.
        """
        self.ensure_one()
        return False
