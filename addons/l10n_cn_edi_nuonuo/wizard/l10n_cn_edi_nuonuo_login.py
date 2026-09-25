# Part of Odoo. See LICENSE file for full copyright and licensing details.
from urllib.parse import urlencode

from odoo import api, fields, models
from odoo.exceptions import UserError

# getQrCode's qrCodeType: which app the drawer scans the code with.
QR_APPS = {
    '1': "WeChat or Alipay",
    '2': "the tax bureau app (税务 APP)",
    '3': "the electronic business licence app (电子营业执照)",
    '4': "the tax bureau app (税务 APP)",
    '5': "the individual income tax app (个人所得税 APP)",
    '6': "the individual income tax app (个人所得税 APP)",
}


class L10nCnEdiNuonuoLogin(models.TransientModel):
    _name = 'l10n_cn_edi_nuonuo.login'
    _description = "Nuonuo Tax Bureau Login"

    company_id = fields.Many2one(comodel_name='res.company', required=True, readonly=True)
    invoice_ids = fields.Many2many(
        comodel_name='account.move',
        readonly=True,
        help="Invoices waiting for this login, sent again once it's done.",
    )
    purpose = fields.Selection(
        selection=[('login', "Log In"), ('verify', "Confirm Identity")],
        required=True,
        readonly=True,
    )
    method = fields.Selection(
        selection=[('qr', "QR Code"), ('sms', "SMS Code")],
        string="Log In With",
        default='qr',
        required=True,
    )
    qr_code = fields.Char(readonly=True)
    qr_image_url = fields.Char(compute='_compute_qr_image_url')
    qr_app = fields.Char(string="Scan With", readonly=True)
    qr_expires = fields.Char(string="Valid Until", readonly=True)
    auth_id = fields.Char(readonly=True)
    sms_sent = fields.Boolean(readonly=True)
    sms_code = fields.Char(string="SMS Code")

    @api.depends('qr_code')
    def _compute_qr_image_url(self):
        for wizard in self:
            wizard.qr_image_url = wizard.qr_code and '/report/barcode/?' + urlencode({
                'barcode_type': 'QR',
                'value': wizard.qr_code,
                'width': 240,
                'height': 240,
            })

    def action_show_qr_code(self):
        self.ensure_one()
        self._fetch_qr_code()
        return self._action_reopen()

    def action_renew_qr_code(self):
        self.ensure_one()
        self._fetch_qr_code(renew=True)
        return self._action_reopen()

    def action_send_sms(self):
        self.ensure_one()
        self.company_id._l10n_cn_edi_get_client().send_login_sms()
        self.sms_sent = True
        return self._action_reopen()

    def action_confirm(self):
        """The drawer scanned the code or typed the SMS code: have the bureau confirm, then move on."""
        self.ensure_one()
        client = self.company_id._l10n_cn_edi_get_client()
        if self.purpose == 'verify':
            confirmed = client.confirm_identity(self.auth_id)
        elif self.method == 'sms':
            if not (self.sms_code or '').strip().isdigit():
                raise UserError(self.env._("Please enter the code texted to the drawer's phone."))
            confirmed = client.confirm_login(self.sms_code.strip())
        else:
            confirmed = client.confirm_login()
        if not confirmed:
            raise UserError(self.env._("The tax bureau hasn't confirmed yet. Please wait a few seconds, then click Done again."))
        # Logging in may reveal that the identity check is due as well.
        return self.company_id._l10n_cn_edi_action_login(self.invoice_ids)

    def _fetch_qr_code(self, renew=False):
        qr = self.company_id._l10n_cn_edi_get_client().get_qr_code(self.purpose, renew=renew)
        self.write({
            'qr_code': qr['qr_code'],
            'qr_app': QR_APPS.get(qr['qr_type'], ''),
            'qr_expires': qr['expires'],
            'auth_id': qr['auth_id'],
        })

    def _action_reopen(self):
        return {
            'type': 'ir.actions.act_window',
            'name': self.env._("Tax Bureau Login"),
            'res_model': self._name,
            'res_id': self.id,
            'view_mode': 'form',
            'target': 'new',
        }
