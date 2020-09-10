# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging

from werkzeug import urls

from odoo import _, api, models
from odoo.exceptions import ValidationError
from odoo.tools.float_utils import float_repr

from odoo.addons.payment import utils as payment_utils
from odoo.addons.payment_payulatam.controllers.main import PayuLatamController

_logger = logging.getLogger(__name__)


class PaymentTransaction(models.Model):
    _inherit = 'payment.transaction'

    @api.model
    def _compute_reference(self, provider, prefix=None, separator='-', **kwargs):
        """ Override of payment to ensure that PayU Latam requirements for references are satisfied.

        PayU Latam requirements for transaction are as follows:
        - References must be unique at provider level for a given merchant account.
          This is satisfied by singularizing the prefix with the current datetime. If two
          transactions are created simultaneously, `_compute_reference` ensures the uniqueness of
          references by suffixing a sequence number.
        """
        if provider == 'payulatam':
            prefix = payment_utils.singularize_reference_prefix(prefix=prefix, separator=separator)
        return super()._compute_reference(provider, prefix=prefix, separator=separator, **kwargs)

    def _get_specific_rendering_values(self, processing_values):
        if self.provider != 'payulatam':
            return super()._get_specific_rendering_values(processing_values)

        api_url = 'https://checkout.payulatam.com/ppp-web-gateway-payu/' \
            if self.acquirer_id.state == 'enabled' \
            else 'https://sandbox.checkout.payulatam.com/ppp-web-gateway-payu/'
        payulatam_values = {
            **processing_values,
            'merchantId': self.acquirer_id.payulatam_merchant_id,
            'referenceCode': processing_values.get('reference'),
            'description': processing_values.get('reference'),
            'amount': float_repr(processing_values['amount'], self.currency_id.decimal_places or 2),
            'tax': 0,
            'taxReturnBase': 0,
            'currency': self.currency_id.name,
            'accountId': self.acquirer_id.payulatam_account_id,
            'buyerFullName': self.partner_name,
            'buyerEmail': self.partner_email,
            'responseUrl': urls.url_join(self.get_base_url(), PayuLatamController._return_url),
            'redirect_url': api_url,
        }
        if self.acquirer_id.state != 'enabled':
            payulatam_values['test'] = 1
        payulatam_values['signature'] = self.acquirer_id._payulatam_generate_sign(
            payulatam_values, incoming=False
        )
        return payulatam_values

    @api.model
    def _get_tx_from_feedback_data(self, provider, data):
        if provider != 'payulatam':
            return super()._get_tx_from_feedback_data(provider, data)

        reference = data.get('referenceCode')
        sign = data.get('signature')
        if not reference or not sign:
            raise ValidationError(
                "PayU Latam: " + _(
                    "Received data with missing reference (%(ref)s) or sign (%(sign)s).",
                    ref=reference, sign=sign
                )
            )

        tx = self.search([('reference', '=', reference)])
        if not tx:
            raise ValidationError(
                "PayU Latam: " + _(
                    "Received data for reference %s matching no transaction.", reference
                )
            )

        # Verify signature
        sign_check = tx.acquirer_id._payulatam_generate_sign(data, incoming=True)
        if sign_check != sign:
            raise ValidationError(
                "PayU Latam: " + _(
                    "Invalid sign: received %(sign)s, computed %(check)s.",
                    sign=sign, check=sign_check
                )
            )

        return tx

    def _process_feedback_data(self, data):
        self.ensure_one()
        if self.provider != 'payulatam':
            return super()._process_feedback_data(data)

        self.acquirer_reference = data.get('transactionId')
        self.state_message = data.get('message', "")

        status = data.get('lapTransactionState')
        if status == 'PENDING':
            self._set_pending()
        elif status == 'APPROVED':
            self._set_done()
        elif status in ('EXPIRED', 'DECLINED'):
            self._set_canceled()
        else:
            _logger.info(
                f"received unrecognized payment state {status} for transaction with reference "
                f"{self.reference}"
            )
            self._set_error("PayU Latam: " + _("Invalid payment status."))
