from odoo import models, fields


class ResCompany(models.Model):
    _inherit = 'res.company'

    l10n_pl_edi_certificate = fields.Many2one(
        string="Certificate",
        store=True,
        comodel_name='certificate.certificate',
    )

    l10n_pl_access_token = fields.Char(string="KSeF Token", readonly=True, copy=False)
    l10n_pl_refresh_token = fields.Char(string="KSeF Token Expiration", readonly=True, copy=False)

    l10n_pl_edi_register = fields.Boolean(default=False)

    l10n_pl_ksef_session_id = fields.Char(string="Reference number", readonly=True)
    l10n_pl_ksef_session_key = fields.Binary(string="Session key", readonly=True)
    l10n_pl_ksef_session_iv = fields.Binary(string="Session iv", readonly=True)

    def action_reset_ksef_credentials(self):
        """
        Hard reset for KSeF. Wipes all session data, tokens, and keys.
        Useful when encountering Session Error 21180 or corrupted keys.
        """
        self.ensure_one()
        self.write({
            'l10n_pl_edi_certificate': False,
            'l10n_pl_access_token': False,
            'l10n_pl_refresh_token': False,
            'l10n_pl_edi_register': False,
            'l10n_pl_ksef_session_id': False,
            'l10n_pl_ksef_session_key': False,
            'l10n_pl_ksef_session_iv': False,
        })
        return True
