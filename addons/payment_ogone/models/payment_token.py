# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, models
from odoo.exceptions import UserError


class PaymentToken(models.Model):
    _inherit = 'payment.token'

    def _handle_activation_request(self):
        """ Raise an error informing the user that tokens managed by Ogone cannot be restored.

        More specifically, permanents tokens are never deleted in Ogone's backend but we don't
        distinguish them from temporary tokens which are archived at creation time. So we simply
        block the reactivation of every token.

        Note: self.ensure_one()

        :return: None
        :raise: UserError if the token is managed by Ogone
        """
        self.ensure_one()

        if self.provider != 'ogone':
            return super()._handle_activation_request()

        raise UserError(_("Saved payment methods cannot be restored once they have been archived."))
