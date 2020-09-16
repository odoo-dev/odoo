# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
from hashlib import md5

from odoo import api, fields, models

_logger = logging.getLogger(__name__)


class PaymentAcquirer(models.Model):
    _inherit = 'payment.acquirer'

    provider = fields.Selection(selection_add=[
        ('alipay', 'Alipay')
    ], ondelete={'alipay': 'set default'})
    alipay_payment_method = fields.Selection([
        ('express_checkout', 'Express Checkout (only for Chinese Merchant)'),
        ('standard_checkout', 'Cross-border'),
    ], string='Account', default='express_checkout',
        help='* Cross-border: For the overseas seller \n* Express Checkout: For the Chinese Seller')
    alipay_merchant_partner_id = fields.Char(
        string='Merchant Partner ID', required_if_provider='alipay', groups='base.group_system')
    alipay_md5_signature_key = fields.Char(
        string='MD5 Signature Key', required_if_provider='alipay', groups='base.group_system')
    alipay_seller_email = fields.Char(string='Alipay Seller Email', groups='base.group_system')

    def _compute_fees(self, amount, currency, country):
        """ Compute alipay fees.

        :param float amount: The amount to pay for the transaction
        :param recordset currency: The currency of the transaction, as a `res.currency` record
        :param recordset country: The customer country, as a `res.country` record
        :return: The computed fees
        :rtype: float
        """
        if self.provider != 'alipay':
            return super()._compute_fees(amount, currency, country)

        fees = 0.0
        if self.fees_active:
            if country.id == self.company_id.country_id.id:
                percentage = self.fees_dom_var
                fixed = self.fees_dom_fixed
            else:
                percentage = self.fees_int_var
                fixed = self.fees_int_fixed
            fees = (percentage / 100.0 * amount + fixed) / (1 - percentage / 100.0)
        return fees

    def _alipay_build_sign(self, val):
        # Rearrange parameters in the data set alphabetically
        data_to_sign = sorted(val.items())
        # Format key-value pairs of parameters that should be signed
        data_to_sign = [f"{k}={v}" for k, v in data_to_sign
                        if k not in ['sign', 'sign_type', 'reference']]
        # Build the data string of &-separated key-value pairs
        data_string = '&'.join(data_to_sign)
        data_string += self.alipay_md5_signature_key
        return md5(data_string.encode('utf-8')).hexdigest()

    @api.model
    def _alipay_get_api_url(self):
        if self.state == 'enabled':
            return 'https://mapi.alipay.com/gateway.do'
        else:  # test environment
            return 'https://openapi.alipaydev.com/gateway.do'
