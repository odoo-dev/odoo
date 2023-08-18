# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
import pprint

from odoo import _, api, fields, models
from odoo.fields import Command
from odoo.exceptions import UserError, ValidationError

from .authorize_request import AuthorizeAPI

_logger = logging.getLogger(__name__)


class PaymentProvider(models.Model):
    _inherit = 'payment.provider'

    code = fields.Selection(
        selection_add=[('authorize', 'Authorize.Net')], ondelete={'authorize': 'set default'})
    authorize_login = fields.Char(
        string="API Login ID", help="The ID solely used to identify the account with Authorize.Net",
        required_if_provider='authorize')
    authorize_transaction_key = fields.Char(
        string="API Transaction Key", required_if_provider='authorize', groups='base.group_system')
    authorize_signature_key = fields.Char(
        string="API Signature Key", required_if_provider='authorize', groups='base.group_system')
    authorize_client_key = fields.Char(
        string="API Client Key",
        help="The public client key. To generate directly from Odoo or from Authorize.Net backend.")

    # === CONSTRAINT METHODS ===#

    # Authorize.Net supports only one currency: "One gateway account is required for each currency"
    # See https://community.developer.authorize.net/t5/The-Authorize-Net-Developer-Blog/Authorize-Net-UK-Europe-Update/ba-p/35957
    @api.constrains('available_currency_ids', 'state')
    def _limit_available_currency_ids(self):
        for provider in self.filtered(lambda p: p.code == 'authorize'):
            if len(provider.available_currency_ids) > 1 and provider.state != 'disabled':
                raise ValidationError(
                    _("Only one currency can be selected by Authorize.Net account.")
                )

    #=== COMPUTE METHODS ===#

    def _compute_feature_support_fields(self):
        """ Override of `payment` to enable additional features. """
        super()._compute_feature_support_fields()
        self.filtered(lambda p: p.code == 'authorize').update({
            'support_manual_capture': 'full_only',
            'support_refund': 'full_only',
            'support_tokenization': True,
        })

    # === ACTION METHODS ===#

    def action_update_merchant_details(self):
        """ Fetch the merchant details to update the client key and the account currency. """
        self.ensure_one()

        if self.state == 'disabled':
            raise UserError(_("This action cannot be performed while the provider is disabled."))

        authorize_API = AuthorizeAPI(self)

        # Validate the API Login ID and Transaction Key
        res_content = authorize_API.test_authenticate()
        _logger.info("test_authenticate request response:\n%s", pprint.pformat(res_content))
        if res_content.get('err_msg'):
            raise UserError(_("Failed to authenticate.\n%s", res_content['err_msg']))

        # Update the merchant details
        res_content = authorize_API.merchant_details()
        _logger.info("merchant_details request response:\n%s", pprint.pformat(res_content))
        if res_content.get('err_msg'):
            raise UserError(_("Could not fetch merchant details:\n%s", res_content['err_msg']))

        currency = self.env['res.currency'].search([('name', 'in', res_content.get('currencies'))])
        self.available_currency_ids = [Command.set(currency.ids)]
        self.authorize_client_key = res_content.get('publicClientKey')

    # === BUSINESS METHODS ===#

    def _get_validation_amount(self):
        """ Override of payment to return the amount for Authorize.Net validation operations.

        :return: The validation amount
        :rtype: float
        """
        res = super()._get_validation_amount()
        if self.code != 'authorize':
            return res

        return 0.01

    def _get_validation_currency(self):
        """ Override of payment to return the currency for Authorize.Net validation operations.

        :return: The validation currency
        :rtype: recordset of `res.currency`
        """
        res = super()._get_validation_currency()
        if self.code != 'authorize':
            return res

        return self.available_currency_ids[0]
