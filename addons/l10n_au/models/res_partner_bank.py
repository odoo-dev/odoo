# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import re
from itertools import starmap

from odoo import api, fields, models, _
from odoo.exceptions import ValidationError


class ResPartnerBank(models.Model):
    _inherit = "res.partner.bank"

    aba_bsb = fields.Char(string='BSB', help='Bank State Branch code - needed if payment is to be made using ABA files')

    proxy_type = fields.Selection(
        selection_add=[
            ('phone', "Phone Number"),
            ('email', "Email Address"),
            ('abn', "ABN"),
            ('id', "Organisation Identifier"),
        ],
        ondelete={'phone': 'set default', 'email': 'set default', 'abn': 'set default', 'id': 'set default'},
    )

    # ABA

    @api.model
    def _get_supported_account_types(self):
        rslt = super(ResPartnerBank, self)._get_supported_account_types()
        rslt.append(('aba', _('ABA')))
        return rslt

    @api.constrains('aba_bsb')
    def _validate_aba_bsb(self):
        for record in self:
            if record.aba_bsb:
                test_bsb = re.sub('( |-)', '', record.aba_bsb)
                if len(test_bsb) != 6 or not test_bsb.isdigit():
                    raise ValidationError(_('BSB is not valid (expected format is "NNN-NNN"). Please rectify.'))

    @api.depends('acc_number')
    def _compute_acc_type(self):
        """ Criteria to be an ABA account:
            - Spaces, hypens, digits are valid.
            - Total length must be 9 or less.
            - Cannot be only spaces, zeros or hyphens (must have at least one digit in range 1-9)
        """
        super()._compute_acc_type()
        for rec in self:
            if rec.acc_type == 'bank' and re.match(r"^(?=.*[1-9])[ \-\d]{0,9}$", rec.acc_number or ''):
                rec.acc_type = 'aba'

    # NPP QR code

    @api.constrains('proxy_type', 'proxy_value', 'partner_id')
    def _check_au_proxy(self):
        tax_id_re = re.compile(r'^[0-9]{11}$')
        mobile_re = re.compile(r'^[0-9]{10}$')
        for bank in self.filtered(lambda b: b.country_code == 'AU'):
            if bank.proxy_type not in ['phone', 'email', 'abn', 'id', 'none', False]:
                raise ValidationError(_("The Proxy Type must be either Phone Number, Email Address, ABN or Organisation Identifier to generate a NPP QR code for account number %s.", bank.acc_number))
            if bank.proxy_type == 'abn' and (not bank.proxy_value or not tax_id_re.match(bank.proxy_value)):
                raise ValidationError(_("The ABN number must be in the format 12345678901 for account number %s.", bank.acc_number))
            if bank.proxy_type == 'mobile' and (not bank.proxy_value or not mobile_re.match(bank.proxy_value)):
                raise ValidationError(_("The Mobile Number must be in the format 0412345678 for account number %s.", bank.acc_number))

    @api.depends('country_code')
    def _compute_display_qr_setting(self):
        bank_au = self.filtered(lambda b: b.country_code == 'AU')
        bank_au.display_qr_setting = True
        super(ResPartnerBank, self - bank_au)._compute_display_qr_setting()

    # Follow the documentation of NPP QR Code Standard [1]
    # [1]: https://nppa.com.au/wp-content/uploads/2021/12/NPP-QR-Code-Standard_v1.1_Dec-2021.pdf
    def _get_merchant_account_info(self):
        if self.country_code == 'AU':
            fps_type_mapping = {
                'phone': 1,
                'email': 2,
                'abn': 3,
                'id': 4,
            }
            fps_type = fps_type_mapping[self.proxy_type]
            merchant_account_vals = [
                (0, 'au.com.nppa'),                                  # GUID
                (1, self.acc_holder_name),                           # Account Name
                (2, self.acc_number),                                # Account BBAN
                (3, self.proxy_value),                               # Proxy Value
                (4, fps_type),                                       # Proxy Type
            ]
            merchant_account_info = ''.join(starmap(self._serialize, merchant_account_vals))
            return (26, merchant_account_info)
        return super()._get_merchant_account_info()

    def _get_error_messages_for_qr(self, qr_method, debtor_partner, currency):
        if qr_method == 'emv_qr' and self.country_code == 'AU':
            # NPP does not seem to enforce the use of AUD as currency.
            return None  # Needed to avoid falling back on the error.

        return super()._get_error_messages_for_qr(qr_method, debtor_partner, currency)

    def _check_for_qr_code_errors(self, qr_method, amount, currency, debtor_partner, free_communication, structured_communication):
        if qr_method == 'emv_qr' and self.country_code == 'AU' and self.proxy_type not in ['phone', 'email', 'abn', 'id']:
            return _("The Proxy Type must be either Phone Number, Email Address, ABN or Organisation Identifier to generate a NPP QR code")

        return super()._check_for_qr_code_errors(qr_method, amount, currency, debtor_partner, free_communication, structured_communication)
