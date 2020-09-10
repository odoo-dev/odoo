# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from werkzeug import urls

from odoo import _, api, models
from odoo.exceptions import ValidationError

from odoo.addons.payment import utils as payment_utils
from odoo.addons.payment_payumoney.controllers.main import PayUMoneyController


class PaymentTransaction(models.Model):
    _inherit = 'payment.transaction'

    def _get_specific_rendering_values(self, processing_values):
        if self.provider != 'payumoney':
            return super()._get_specific_rendering_values(processing_values)

        first_name, last_name = payment_utils.split_partner_name(self.partner_id.name)
        api_url = 'https://secure.payu.in/_payment' if self.acquirer_id.state == 'enabled' \
            else 'https://sandboxsecure.payu.in/_payment'
        payumoney_values = {
            'key': self.acquirer_id.payumoney_merchant_key,
            'txnid': processing_values['reference'],
            'amount': processing_values['amount'],
            'productinfo': processing_values['reference'],
            'firstname': first_name,
            'lastname': last_name,
            'email': self.partner_id.email,
            'phone': self.partner_id.phone,
            'return_url': urls.url_join(self.get_base_url(), PayUMoneyController._return_url),
            'api_url': api_url,
        }
        payumoney_values['hash'] = self.acquirer_id._payumoney_generate_sign(
            payumoney_values, incoming=False,
        )
        return payumoney_values

    @api.model
    def _get_tx_from_feedback_data(self, provider, data):
        if provider != 'payumoney':
            return super()._get_tx_from_feedback_data(provider, data)

        reference = data.get('txnid')
        shasign = data.get('hash')
        if not reference or not shasign:
            raise ValidationError(
                "PayUmoney: " + _(
                    "Received data with missing reference (%(ref)s) or shasign (%(sign)s)",
                    ref=reference, sign=shasign,
                )
            )

        tx = self.search([('reference', '=', reference)])
        if not tx:
            raise ValidationError(
                "PayUmoney: " + _(
                    "Received data with reference %s matching no transaction", reference
                )
            )

        # Verify shasign
        shasign_check = tx.acquirer_id._payumoney_generate_sign(data, incoming=True)
        if shasign_check != shasign:
            raise ValidationError(
                "PayUmoney: " + _(
                    "Invalid shasign: received %(sign)s, computed %(computed)s.",
                    sign=shasign, computed=shasign_check
                )
            )

        return tx

    def _process_feedback_data(self, data):
        if self.provider != 'payumoney':
            return super()._process_feedback_data(data)

        status = data.get('status')
        self.acquirer_reference = data.get('payuMoneyId')

        if status == 'success':
            self._set_done()
        else:  # 'failure'
            # See https://www.payumoney.com/pdf/PayUMoney-Technical-Integration-Document.pdf
            error_code = data.get('Error')
            self._set_error(
                "PayUmoney: " + _("The payment encountered an error with code %s", error_code)
            )
