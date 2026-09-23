# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import fields, models

from odoo.addons.l10n_cn_edi_nuonuo.tools import NuonuoClient


class ResCompany(models.Model):
    _inherit = 'res.company'

    l10n_cn_edi_nuonuo_app_key = fields.Char(string="Nuonuo App Key")
    l10n_cn_edi_nuonuo_app_secret = fields.Char(string="Nuonuo App Secret", groups='base.group_system')
    l10n_cn_edi_nuonuo_token = fields.Char(
        string="Nuonuo Access Token",
        groups='base.group_system',
        help="The permanent token of the company's Nuonuo app (自用型).",
    )
    l10n_cn_edi_nuonuo_extension_number = fields.Char(
        string="Extension Number (分机号)",
        help="The Nuonuo extension that issues 数电 invoices for this company.",
    )
    l10n_cn_edi_nuonuo_ele_account = fields.Char(
        string="Digital Account (全电账号)",
        help="The tax bureau account used to issue 数电 invoices, usually a mobile number.",
    )

    def _l10n_cn_edi_get_client(self):
        # EXTENDS 'l10n_cn_edi'
        self.ensure_one()
        return NuonuoClient(self)

    def _l10n_cn_edi_is_ready(self):
        # EXTENDS 'l10n_cn_edi'
        self.ensure_one()
        company = self.sudo()
        return bool(
            company.vat
            and company.l10n_cn_edi_nuonuo_app_key
            and company.l10n_cn_edi_nuonuo_app_secret
            and company.l10n_cn_edi_nuonuo_token,
        )
