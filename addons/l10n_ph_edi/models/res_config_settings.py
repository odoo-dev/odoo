# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models, api


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    # ------------------
    # Fields declaration
    # ------------------

    l10n_ph_edi_accreditation_id = fields.Char(
        related="company_id.l10n_ph_edi_accreditation_id",
        readonly=False,
    )
    l10n_ph_edi_application_id = fields.Char(
        related="company_id.l10n_ph_edi_application_id",
        readonly=False,
    )
    l10n_ph_edi_application_key = fields.Char(
        related="company_id.l10n_ph_edi_application_key",
        readonly=False,
    )
    l10n_ph_edi_user_id = fields.Char(
        related="company_id.l10n_ph_edi_user_id",
        readonly=False,
    )
    l10n_ph_edi_user_password = fields.Char(
        related="company_id.l10n_ph_edi_user_password",
        readonly=False,
    )
    l10n_ph_edi_eis_public_key = fields.Char(
        related="company_id.l10n_ph_edi_eis_public_key",
        readonly=False,
    )
    l10n_ph_edi_eis_jws_key = fields.Char(
        related="company_id.l10n_ph_edi_eis_jws_key",
        readonly=False,
    )
    l10n_ph_edi_eis_jws_private_key = fields.Char(
        related="company_id.l10n_ph_edi_eis_jws_private_key",
        readonly=False,
    )
    l10n_ph_edi_in_use = fields.Boolean(related="company_id.l10n_ph_edi_in_use")

    # ----------------------------
    # Onchange, Constraint methods
    # ----------------------------

    @api.onchange('l10n_ph_edi_accreditation_id', 'l10n_ph_edi_application_id', 'l10n_ph_edi_application_key', 'l10n_ph_edi_user_id', 'l10n_ph_edi_user_password')
    def _onchange_eis_credentials(self):
        """ I expect users to re-enable the integration when credentials are changed, which in turn validate that these are correct. """
        self.l10n_ph_edi_in_use = False

    # --------------
    # Action methods
    # --------------

    def action_l10n_ph_edi_enable(self):
        """ Asking an action from the user allows us to validate the credentials and let them know from the start if any issues arises. """
        self.company_id._l10n_ph_edi_enable()
