# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging

from werkzeug import urls

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError

from odoo.addons.payment import utils as payment_utils
from odoo.addons.payment_paypal.controllers.main import PaypalController

_logger = logging.getLogger(__name__)


class PaymentTransaction(models.Model):
    _inherit = 'payment.transaction'

    # See https://developer.paypal.com/docs/api-basics/notifications/ipn/IPNandPDTVariables/
    paypal_type = fields.Char(
        string="PayPal Transaction Type", help="This has no use in Odoo except for debugging.")

    def _get_specific_rendering_values(self, processing_values):
        if self.acquirer_id.provider != 'paypal':
            return super()._get_specific_rendering_values(processing_values)

        base_url = self.acquirer_id._get_base_url()
        partner_first_name, partner_last_name = payment_utils.split_partner_name(self.partner_name)
        notify_url = self.acquirer_id.paypal_use_ipn \
                     and urls.url_join(base_url, PaypalController._notify_url)
        return {
            **processing_values,
            'address1': self.partner_address,
            'business': self.acquirer_id.paypal_email_account,
            'city': self.partner_city,
            'cmd': '_xclick',
            'country': self.partner_country_id.code,
            'currency_code': self.currency_id.name,
            'email': self.partner_email,
            'first_name': partner_first_name,
            'handling': self.fees,
            'item_name': f"{self.company_id.name}: {self.reference}",
            'item_number': self.reference,
            'last_name': partner_last_name,
            'lc': self.partner_lang,
            'notify_url': notify_url,
            'return_url': urls.url_join(base_url, PaypalController._return_url),
            'state': self.partner_state_id.name,
            'tx_url': self.acquirer_id._paypal_get_api_url(),
            'zip_code': self.partner_zip,
        }

    @api.model
    def _get_tx_from_feedback_data(self, provider, data):
        if provider != 'paypal':
            return super()._get_tx_from_feedback_data(provider, data)

        reference = data.get('item_number')
        tx = self.env['payment.transaction'].search([('reference', '=', reference)])
        if not tx:
            raise ValidationError(
                "PayPal: " + _("No transaction found matching reference %s", reference)
            )
        return tx

    def _process_feedback_data(self, data):
        self.ensure_one()
        if self.acquirer_id.provider != 'paypal':
            super()._process_feedback_data(data)

        txn_id = data.get('txn_id')
        txn_type = data.get('txn_type')
        if not all((txn_id, txn_type)):
            raise ValidationError(
                "PayPal: " + _(
                    "Missing value for txn_id (%(txn_id)s) or txn_type (%(txn_type)s).",
                    txn_id=txn_id, txn_type=txn_type
                )
            )
        self.acquirer_reference = txn_id
        self.paypal_type = txn_type

        payment_status = data.get('payment_status')

        if payment_status in ('Pending', 'Processed', 'Completed') and not all(
            (self.acquirer_id.paypal_pdt_token, self.acquirer_id.paypal_seller_account)
        ):  # If a payment is made on an account waiting for configuration, send a reminder email
            self.acquirer_id._paypal_send_configuration_reminder()

        if payment_status in ('Processed', 'Completed'):
            self._set_done()
        elif payment_status == 'Pending':
            self._set_pending()
            self.state_message = data.get('pending_reason', '')
        elif payment_status == 'Expired':
            self._set_canceled()
        else:
            _logger.info(f"received data with invalid payment status: {payment_status}")
            self._set_error(
                "PayPal: " + _("Received data with invalid payment status: %s", payment_status)
            )
