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

    def _l10n_cn_edi_action_login(self, invoices=None):
        # EXTENDS 'l10n_cn_edi'
        self.ensure_one()
        client = self._l10n_cn_edi_get_client()
        client.ensure_ready()
        session_state = client.get_session_state()
        if session_state == 'ok':
            if invoices:
                return invoices.action_send_and_print()
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'type': 'success',
                    'message': self.env._("%s is logged in to the tax bureau.", self.name),
                    'next': {'type': 'ir.actions.act_window_close'},
                },
            }
        wizard = self.env['l10n_cn_edi_nuonuo.login'].create({
            'company_id': self.id,
            'invoice_ids': invoices.ids if invoices else [],
            'purpose': session_state,
        })
        if session_state == 'verify':
            # The identity check only works by QR code.
            wizard._fetch_qr_code()
        return wizard._action_reopen()
