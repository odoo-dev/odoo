# Part of Odoo. See LICENSE file for full copyright and licensing details.

import json
import urllib.parse
from base64 import b16encode

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

from odoo import fields, models
from odoo.addons.payment_neoleap import const


class PaymentProvider(models.Model):
    _inherit = 'payment.provider'

    code = fields.Selection(selection_add=[('neoleap', 'NeoLeap')], ondelete={'neoleap': 'set default'})
    neoleap_tranportal_id = fields.Char("Tranportal ID")
    neoleap_password = fields.Char("Tranportal Password")
    neoleap_resource_key = fields.Char("Terminal Resource Key")

    def _encrypt_trandata(self, trandata):
        key = self.neoleap_resource_key.encode('utf-8')
        iv = b'PGKEYENCDECIVSPC'
        raw = json.dumps(trandata).encode('utf-8')
        pad_len = 16 - (len(raw) % 16)
        raw += bytes([pad_len] * pad_len)

        cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
        encryptor = cipher.encryptor()
        encrypted = encryptor.update(raw) + encryptor.finalize()

        hex_string = b16encode(encrypted).decode('utf-8')
        url_encoded = urllib.parse.quote(hex_string)
        return url_encoded

    def _compute_feature_support_fields(self):
        """ Override of `payment` to enable additional features. """
        super()._compute_feature_support_fields()
        self.filtered(lambda p: p.code == 'neoleap').update({
            'support_refund': 'partial',
        })

    def _get_default_payment_method_codes(self):
        """ Override of `payment` to return the default payment method codes. """
        default_codes = super()._get_default_payment_method_codes()
        if self.code != 'neoleap':
            return default_codes
        return const.DEFAULT_PAYMENT_METHOD_CODES
    
    def _get_supported_currencies(self):
        """ Override of `payment` to return the supported currencies. """
        # breakpoint()
        supported_currencies = super()._get_supported_currencies()
        if self.code == 'neoleap':
            supported_currencies = supported_currencies.filtered(
                lambda c: c.name in const.SUPPORTED_CURRENCIES
            )
        return supported_currencies
