# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import fields, models


class ResUsers(models.Model):
    _inherit = 'res.users'

    l10n_kz_edi_last_session_date = fields.Datetime(
        string="KZ ESF Last Session",
        help="Timestamp of the last ESF session opened by this user. Used to throttle "
             "the number of authentication sessions to one per five minutes.",
    )
    l10n_kz_edi_signer_iin = fields.Char(
        string="KZ ESF Signer IIN",
        help="Individual Identification Number (ИИН) of the ЭЦП certificate holder who "
             "authenticates against the ESF. It is sent to AuthService.createAuthTicket "
             "to obtain the ticket that NCALayer signs, and as the WS-Security username "
             "of SessionService.createSessionSigned.",
    )
    l10n_kz_edi_password = fields.Char(
        string="KZ ESF Password",
        help="Password of the ESF account tied to the signer IIN. It is sent as the "
             "WS-Security UsernameToken password of SessionService.createSessionSigned, "
             "which the ESF validates alongside the signed ticket.",
    )

    @property
    def SELF_READABLE_FIELDS(self):
        return super().SELF_READABLE_FIELDS + ['l10n_kz_edi_signer_iin', 'l10n_kz_edi_password']

    @property
    def SELF_WRITEABLE_FIELDS(self):
        return super().SELF_WRITEABLE_FIELDS + ['l10n_kz_edi_signer_iin', 'l10n_kz_edi_password']
