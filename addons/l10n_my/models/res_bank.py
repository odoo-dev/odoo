# Part of Odoo. See LICENSE file for full copyright and licensing details.

import re

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError


class ResPartnerBank(models.Model):
    _inherit = 'res.partner.bank'

    proxy_type = fields.Selection(selection_add=[('my_qr_id', "QR ID")], ondelete={'my_qr_id': 'set default'})
    acquirer_id = fields.Char(
        "Acquirer ID",
        help=(
            "This unique identifier is assigned by your Malaysian acquiring bank or financial institution "
            "for your specific merchant account. Contact your payment administrator or the bank that issued "
            "your merchant credentials to obtain the correct Acquirer ID."))
    rrn = fields.Char(
        "Recipient Reference Number",
        help="Required for JomPAY QR."
    )

    @api.constrains('proxy_type', 'proxy_value', 'partner_id')
    def _check_hk_proxy(self):
        qr_id_pattern = r"^[a-zA-Z0-9]+$"
        for bank in self.filtered(lambda b: b.country_code == 'MY'):
            if bank.proxy_type not in ['my_qr_id', 'none', False]:
                raise ValidationError(_("The Proxy Type must be QR ID to generate a payment QR code for account number %s.", bank.acc_number))
            if bank.proxy_type == 'my_qr_id' and (not bank.proxy_value or len(bank.proxy_value) > 28 or not re.match(qr_id_pattern, bank.proxy_value)):
                raise ValidationError(_("Invalid QR ID for account number %s: QR ID must be alphanumeric and up to 28 characters long.", bank.acc_number))
            if bank.proxy_type == 'my_qr_id' and (not bank.acquirer_id or len(bank.acquirer_id) > 6):
                raise ValidationError(_("Invalid Acquirer ID for account number %s: Aquirer ID must be up to 6 characters long.", bank.acc_number))
            if bank.proxy_type == 'my_qr_id' and bank.rrn and len(bank.rrn) > 20:
                raise ValidationError(_("Invalid Acquirer ID for account number %s: RRN must be up to 20 characters long.", bank.acc_number))

    @api.depends('country_code')
    def _compute_display_qr_setting(self):
        bank_my = self.filtered(lambda b: b.country_code == 'MY')
        bank_my.display_qr_setting = True
        super(ResPartnerBank, self - bank_my)._compute_display_qr_setting()

    def _get_merchant_account_info(self):
        if self.country_code == 'MY':
            merchant_account_vals = [
                (0, 'A0000006150001'),  # Malaysian AID (Fixed)
                (1, self.acquirer_id),
                (2, self.proxy_value),
            ]
            merchant_account_info = ''.join([self._serialize(*val) for val in merchant_account_vals])
            return (26, merchant_account_info)
        return super()._get_merchant_account_info()

    def _get_additional_data_field(self, comment):
        if self.country_code == 'MY':
            additional_vals = [
                (5, comment),
                (90, self.rrn),  # JomPay QR code RRN
            ]
            return ''.join([self._serialize(*val) for val in additional_vals])
        return super()._get_additional_data_field(comment)

    def _get_qr_code_vals_list(self, qr_method, amount, currency, debtor_partner, free_communication, structured_communication):
        vals_list = super()._get_qr_code_vals_list(qr_method, amount, currency, debtor_partner, free_communication, structured_communication)

        if self.country_code == 'MY':
            # Replace Payload Format Indicator (Key 0)
            index_to_change = -1
            for i, tuple in enumerate(vals_list):
                if tuple[0] == 0:
                    index_to_change = i
                    break

            if index_to_change != -1:
                vals_list[index_to_change] = (0, '02')

        return vals_list

    def _get_error_messages_for_qr(self, qr_method, debtor_partner, currency):
        if qr_method == 'emv_qr' and self.country_code == 'MY':
            if currency.name != 'MYR':
                return _("Cannot generate a payment QR code with a currency other than MYR.")
            return None

        return super()._get_error_messages_for_qr(qr_method, debtor_partner, currency)

    def _check_for_qr_code_errors(self, qr_method, amount, currency, debtor_partner, free_communication, structured_communication):
        if qr_method == 'emv_qr' and self.country_code == 'MY' and self.proxy_type != 'my_qr_id':
            return _("The Proxy Type must be QR ID to generate a payment QR code.")

        return super()._check_for_qr_code_errors(qr_method, amount, currency, debtor_partner, free_communication, structured_communication)
