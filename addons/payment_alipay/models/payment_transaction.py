# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging

from werkzeug import urls

from odoo import _, api, models
from odoo.exceptions import ValidationError
from odoo.tools.float_utils import float_compare

from odoo.addons.payment_alipay.controllers.main import AlipayController

_logger = logging.getLogger(__name__)


class PaymentTransaction(models.Model):
    _inherit = 'payment.transaction'

    # === CRUD METHODS ===#

    @api.model_create_multi
    def create(self, values_list):
        txs = super().create(values_list)
        for tx in txs.filtered(lambda t: t.acquirer_id.provider == 'alipay'):
            tx._alipay_check_configuration()
        return txs

    def write(self, values):
        res = super().write(values)
        if values.get('currency_id') or values.get('acquirer_id'):
            for tx in self.filtered(lambda t: t.acquirer_id.provider == 'alipay'):
                tx._alipay_check_configuration()
        return res

    def _alipay_check_configuration(self):
        if self.acquirer_id.alipay_payment_method == 'express_checkout'\
                and self.currency_id.name != 'CNY':
            raise ValidationError(
                "Alipay: " + _(
                    "Only transactions in Chinese Yuan (CNY) are allowed for Express Checkout."
                )
            )

    # === BUSINESS METHODS ===#

    def _get_specific_rendering_values(self, processing_values):
        if self.acquirer_id.provider != 'alipay':
            return super()._get_specific_rendering_values(processing_values)

        base_url = self.acquirer_id._get_base_url()
        alipay_tx_values = {
            '_input_charset': 'utf-8',
            'notify_url': urls.url_join(base_url, AlipayController._notify_url),
            'out_trade_no': processing_values['reference'],
            'partner': self.acquirer_id.alipay_merchant_partner_id,
            'return_url': urls.url_join(base_url, AlipayController._return_url),
            'subject': processing_values['reference'],
            'total_fee': processing_values['amount'] + self.fees
        }
        if self.acquirer_id.alipay_payment_method == 'standard_checkout':
            # https://global.alipay.com/docs/ac/global/create_forex_trade
            alipay_tx_values.update({
                'service': 'create_forex_trade',
                'product_code': 'NEW_OVERSEAS_SELLER',
                'currency': self.currency_id.name,
            })
        else:
            alipay_tx_values.update({
                'service': 'create_direct_pay_by_user',
                'payment_type': 1,
                'seller_email': self.acquirer_id.alipay_seller_email,
            })

        sign = self.acquirer_id._alipay_build_sign(alipay_tx_values)
        alipay_tx_values.update({
            'sign_type': 'MD5',
            'sign': sign,
            'tx_url': self.acquirer_id._alipay_get_api_url(),
        })
        return alipay_tx_values

    @api.model
    def _get_tx_from_feedback_data(self, provider, data):
        if provider != 'alipay':
            return super()._get_tx_from_feedback_data(provider, data)

        reference = data.get('reference') or data.get('out_trade_no')
        txn_id = data.get('trade_no')
        if not reference or not txn_id:
            raise ValidationError(
                "Alipay: " + _(
                    "Received data with missing reference %(r)s or txn_id %(t)s.",
                    r=reference, t=txn_id
                )
            )

        tx = self.env['payment.transaction'].search([('reference', '=', reference)])
        if not tx:
            raise ValidationError(
                "Alipay: " + _(
                    "Received data with reference %s matching no transaction.", reference
                )
            )

        # Verify signature (done here because we need the reference to get the acquirer)
        sign_check = tx.acquirer_id._alipay_build_sign(data)
        sign = data.get('sign')
        if sign != sign_check:
            raise ValidationError(
                "Alipay: " + _(
                    "Expected signature %(sc) but received %(sign)s.", sc=sign_check, sign=sign
                )
            )

        return tx

    def _process_feedback_data(self, data):
        if self.provider != 'alipay':
            return super()._process_feedback_data(data)

        if float_compare(float(data.get('total_fee', '0.0')), (self.amount + self.fees), 2) != 0:
            # mc_gross is amount + fees
            _logger.error(
                f"Alipay: the paid amount ({data.get('total_fee', '0.0')}) does not match the "
                f"total + fees ({self.amount} + {self.fees}) for transaction with reference "
                f"{self.reference}"
            )
            raise ValidationError("Alipay: " + _("The amount does not match the total + fees."))
        if self.acquirer_id.alipay_payment_method == 'standard_checkout':
            if data.get('currency') != self.currency_id.name:
                raise ValidationError(
                    "Alipay: " + _(
                        "The currency returned by Alipay %(rc)s does not match the transaction "
                        "currency %(tc)s.", rc=data.get('currency'), tc=self.currency_id.name
                    )
                )
        elif data.get('seller_email') != self.acquirer_id.alipay_seller_email:
            _logger.error(
                f"Alipay: the seller email ({data.get('seller_email')}) does not match the "
                f"configured Alipay account ({self.acquirer_id.alipay_seller_email})."
            )
            raise ValidationError(
                "Alipay: " + _("The seller email does not match the configured Alipay account.")
            )

        status = data.get('trade_status')
        if status in ['TRADE_FINISHED', 'TRADE_SUCCESS']:
            self._set_done()
        elif status == 'TRADE_CLOSED':
            _logger.info(f"Alipay: cancelling transaction with reference {self.reference}")
            self._set_canceled()
        else:
            _logger.info(
                f"Alipay: received invalid transaction status for transaction with reference "
                f"{self.reference}: {status} ; set as error"
            )
            self._set_error("Alipay: " + _("received invalid transaction status: %s", status))
