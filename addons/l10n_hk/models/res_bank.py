# Part of Odoo. See LICENSE file for full copyright and licensing details.

import re

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError
from odoo.tools import single_email_re


class ResPartnerBank(models.Model):
    _inherit = 'res.partner.bank'

    proxy_type = fields.Selection(selection_add=[('id', "FPS ID"), ('mobile', "Mobile Number"), ('email', "Email Address")],
                                  ondelete={'id': 'set default', 'mobile': 'set default', 'email': 'set default'})
    l10n_hk_branch_code = fields.Char(
        string="Branch Code",
        help="Code of the branch holding the account. With the Bank Code, it identifies the bank in payment files.",
    )

    @api.constrains('l10n_hk_branch_code')
    def _check_l10n_hk_branch_code(self):
        for bank in self.filtered('l10n_hk_branch_code'):
            # Only ASCII digits: full-width digits typed with Chinese input methods are rejected by the banks
            if not re.fullmatch(r'[0-9]{3}', bank.l10n_hk_branch_code):
                raise ValidationError(_("Branch Code must consist of 3 digits."))

    @api.constrains('proxy_type', 'proxy_value', 'partner_id')
    def _check_hk_proxy(self):
        auto_mobn_re = re.compile(r"^[+]\d{1,3}-\d{6,12}$")
        for bank in self.filtered(lambda b: b.country_code == 'HK'):
            if bank.proxy_type not in ['id', 'mobile', 'email', 'none', False]:
                raise ValidationError(_("The FPS Type must be either ID, Mobile or Email to generate a FPS QR code for account number %s.", bank.account_number))
            if bank.proxy_type == 'id' and (not bank.proxy_value or len(bank.proxy_value) not in [7, 9]):
                raise ValidationError(_("Invalid FPS ID! Please enter a valid FPS ID with length 7 or 9 for account number %s.", bank.account_number))
            if bank.proxy_type == 'mobile' and (not bank.proxy_value or not auto_mobn_re.match(bank.proxy_value)):
                raise ValidationError(_("Invalid Mobile! Please enter a valid mobile number with format +852-67891234 for account number %s.", bank.account_number))
            if bank.proxy_type == 'email' and (not bank.proxy_value or not single_email_re.match(bank.proxy_value)):
                raise ValidationError(_("Invalid Email! Please enter a valid email address for account number %s.", bank.account_number))

    @api.onchange('proxy_value')
    def _onchange_hk_proxy_value(self):
        # Vendors paid by FPS proxy may have no account number to give: reuse the proxy so the account can be saved
        if self.country_code == 'HK' and self.proxy_type not in ('none', False) and not self.account_number:
            self.account_number = self.proxy_value

    @api.model
    def _get_emv_qr_code_names(self):
        return {**super()._get_emv_qr_code_names(), 'HK': _("FPS QR Code")}

    @api.depends('country_code')
    def _compute_country_proxy_keys(self):
        bank_hk = self.filtered(lambda b: b.country_code == 'HK')
        bank_hk.country_proxy_keys = 'id,mobile,email'
        super(ResPartnerBank, self - bank_hk)._compute_country_proxy_keys()

    @api.depends('country_code')
    def _compute_display_qr_setting(self):
        bank_hk = self.filtered(lambda b: b.country_code == 'HK')
        bank_hk.display_qr_setting = True
        super(ResPartnerBank, self - bank_hk)._compute_display_qr_setting()

    # Follow the documentation of FPS QR Code Standard [1]
    # [1]: https://www.hkma.gov.hk/media/eng/doc/key-functions/financial-infrastructure/infrastructure/retail-payment-initiatives/Common_QR_Code_Specification.pdf
    def _get_merchant_account_info(self):
        if self.country_code == 'HK':
            fps_type_mapping = {
                'id': 2,
                'mobile': 3,
                'email': 4,
            }
            fps_type = fps_type_mapping[self.proxy_type]
            merchant_account_vals = [
                (0, 'hk.com.hkicl'),                                 # GUID
                (fps_type, self.proxy_value),                        # Proxy Type and Proxy Value
            ]
            merchant_account_info = ''.join([self._serialize(*val) for val in merchant_account_vals])
            return (26, merchant_account_info)
        return super()._get_merchant_account_info()

    def _get_additional_data_field(self, comment):
        if self.country_code == 'HK':
            return self._serialize(5, comment)
        return super()._get_additional_data_field(comment)

    def _get_error_messages_for_qr(self, qr_method, debtor_partner, currency):
        if qr_method == 'emv_qr' and self.country_code == 'HK':
            if currency.name not in ['HKD', 'CNY']:
                return _("Can't generate a FPS QR code with a currency other than HKD or CNY.")
            return None

        return super()._get_error_messages_for_qr(qr_method, debtor_partner, currency)

    def _check_for_qr_code_errors(self, qr_method, amount, currency, debtor_partner, free_communication, structured_communication):
        if qr_method == 'emv_qr' and self.country_code == 'HK' and self.proxy_type not in ['id', 'mobile', 'email']:
            return _("The FPS Type must be either ID, Mobile or Email to generate a FPS QR code.")

        return super()._check_for_qr_code_errors(qr_method, amount, currency, debtor_partner, free_communication, structured_communication)
