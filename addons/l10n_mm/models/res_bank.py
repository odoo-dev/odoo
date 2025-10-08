# Part of Odoo. See LICENSE file for full copyright and licensing details.

import re

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError
from odoo.tools import single_email_re


class ResPartnerBank(models.Model):
    _inherit = 'res.partner.bank'

    merchant_id = fields.Char("Merchant ID", required=True)
    terminal_id = fields.Char("Terminal ID", default="000000")
    merchant_name_mm = fields.Char("Merchant Name (Myanmar Unicode)", required=True)
    merchant_city_mm = fields.Char("Merchant City (Myanmar Unicode)")

    # Follow the documentation of Myanmar QR Code Standard [1]
    # [1]: https://myanmarpay.gov.mm/frontend/assets/files/MyanmarQRSpecification.pdf
    def _get_merchant_account_info(self):
        if self.country_code == 'MM':
            merchant_account_vals = [
                (0, 'com.mmqrpay.www'),            # GUID
                (1, self.merchant_id[:15]),        # Merchant ID (first 15 digit)
                (2, self.terminal_id),             # Terminal ID
            ]
            merchant_account_info = ''.join([self._serialize(*val) for val in merchant_account_vals])
            return (26, merchant_account_info)
        return super()._get_merchant_account_info()

    def _get_qr_code_vals_list(self, qr_method, amount, currency, debtor_partner, free_communication, structured_communication):
        vals_list = super()._get_qr_code_vals_list(qr_method, amount, currency, debtor_partner, free_communication, structured_communication)
        name = self.merchant_name_mm or self.partner_id.name
        city = self.merchant_city_mm or self.partner_id.city
        merchant_info_vals = [
            (0, 'MY'),      # Language Preference: MY
            (1, name),      # Merchant Name
            (2, city),      # Merchant City
        ]
        merchant_info = ''.join([self._serialize(*val) for val in merchant_info_vals])
        return vals_list + [(64, merchant_info)]

    def _get_additional_data_field(self, comment):
        if self.country_code == 'MM':
            return self._serialize(5, comment)
        return super()._get_additional_data_field(comment)

    def _get_error_messages_for_qr(self, qr_method, debtor_partner, currency):
        if qr_method == 'emv_qr' and self.country_code == 'MM':
            if currency.name not in ['MMK']:
                return _("Can't generate MMQR code with a currency other than MMK.")
            return None

        return super()._get_error_messages_for_qr(qr_method, debtor_partner, currency)

    def _check_for_qr_code_errors(self, qr_method, amount, currency, debtor_partner, free_communication, structured_communication):
        if qr_method == 'emv_qr' and self.country_code == 'MM':
            if not (self.merchant_id.isdigit() and len(self.merchant_id) == 16):
                return _("Invalid Merchant ID.")
            if not self._get_merchant_account_info():
                return _("Missing Merchant Account Information.")
            if not self.partner_id.city:
                return _("Missing Merchant City.")
        return None
