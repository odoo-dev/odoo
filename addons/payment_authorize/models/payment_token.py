# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
import pprint

from odoo import _, fields, models
from odoo.exceptions import UserError

from .authorize_request import AuthorizeAPI

_logger = logging.getLogger(__name__)


class PaymentToken(models.Model):
    _inherit = 'payment.token'

    authorize_profile = fields.Char(
        string="Authorize.Net Profile ID",
        help="The unique reference for the partner/token combination in the Authorize.net backend.")
    provider = fields.Selection(related='acquirer_id.provider')

    def _handle_deactivation_request(self):
        """ Override of payment to request Authorize.Net to remove delete the token. """
        self.ensure_one()

        if self.acquirer_id.provider != 'authorize':
            return super()._handle_deactivation_request()

        authorize_API = AuthorizeAPI(self.acquirer_id)
        res_content = authorize_API.delete_customer_profile(self.authorize_profile)
        _logger.info(f"delete_customer_profile request response:\n{pprint.pformat(res_content)}")

    def _handle_activation_request(self):
        self.ensure_one()

        if self.acquirer_id.provider != 'authorize':
            return super()._handle_activation_request()

        raise UserError(_("Saved payment methods cannot be restored once they have been deleted."))
