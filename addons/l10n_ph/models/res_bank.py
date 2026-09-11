# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models

PH_PROXY_TYPES = {
    'mobile': "Mobile Number",
    'merchant_id': "Merchant ID",
    'personal_bank_account': "Personal Bank Account",
    'corporate_bank_account': "Corporate Bank Account",
}


class ResPartnerBank(models.Model):
    _inherit = 'res.partner.bank'

    proxy_type = fields.Selection(
        selection_add=list(PH_PROXY_TYPES.items()),
        ondelete=dict.fromkeys(PH_PROXY_TYPES, 'set default'),
    )
    l10n_ph_qrph_api_key = fields.Char(string="QRPH API Key", groups='base.group_system')
    l10n_ph_qrph_public_key = fields.Char(string="QRPH Public Key", groups='base.group_system')

    @api.model
    def _get_emv_qr_code_names(self):
        return {**super()._get_emv_qr_code_names(), 'PH': self.env._("QRPH")}

    @api.depends('country_code')
    def _compute_country_proxy_keys(self):
        bank_ph = self.filtered(lambda b: b.country_code == 'PH')
        bank_ph.country_proxy_keys = ','.join(PH_PROXY_TYPES)
        super(ResPartnerBank, self - bank_ph)._compute_country_proxy_keys()

    @api.depends('country_code')
    def _compute_display_qr_setting(self):
        bank_ph = self.filtered(lambda b: b.country_code == 'PH')
        bank_ph.display_qr_setting = True
        super(ResPartnerBank, self - bank_ph)._compute_display_qr_setting()

    def _get_error_messages_for_qr(self, qr_method, debtor_partner, currency):
        if qr_method == 'emv_qr' and self.country_code == 'PH':
            if currency.name != 'PHP':
                return self.env._("Can't generate a QRPH code with a currency other than PHP.")
            return None

        return super()._get_error_messages_for_qr(qr_method, debtor_partner, currency)

    def _check_for_qr_code_errors(self, qr_method, amount, currency, debtor_partner, free_communication, structured_communication):
        if qr_method == 'emv_qr' and self.country_code == 'PH' and self.proxy_type not in PH_PROXY_TYPES:
            return self.env._("The QRPH Type must be either Mobile Number, Merchant ID, Personal Bank Account or Corporate Bank Account to generate a QRPH code.")

        return super()._check_for_qr_code_errors(qr_method, amount, currency, debtor_partner, free_communication, structured_communication)
