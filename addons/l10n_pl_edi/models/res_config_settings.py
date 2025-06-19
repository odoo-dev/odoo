from odoo import models, fields, api


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    l10n_pl_edi_certificate = fields.Many2one(
        string="KSeF Certificate & Private Key",
        related='company_id.l10n_pl_edi_certificate',
        readonly=False,
    )
    l10n_pl_access_token = fields.Char(string="KSeF Access Token", related='company_id.l10n_pl_access_token', readonly=True, copy=False)
    l10n_pl_edi_register = fields.Boolean(
        compute='_compute_l10n_pl_edi_register',
        inverse='_set_l10n_pl_edi_register',
        readonly=False,
    )

    l10n_pl_edi_mode = fields.Selection(
        selection=[('prod', 'Production'), ('test', 'Test')],
        string='KSeF Mode',
        default='test',
        config_parameter='l10n_pl_edi_ksef.mode',
        help="Select 'Production' for real invoices or 'Test' for verification."
    )

    @api.depends('company_id')
    def _compute_l10n_pl_edi_register(self):
        for config in self:
            config.l10n_pl_edi_register = config.company_id.l10n_pl_edi_register

    def _set_l10n_pl_edi_register(self):
        for config in self:
            config.company_id.l10n_pl_edi_register = config.l10n_pl_edi_register

    def action_l10n_pl_edi_disable(self):
        """
        Removes the EDI certificate and access token from the active company.
        Triggered by the 'Deactivate' button in the settings view.
        """
        for record in self:
            record.company_id.action_reset_ksef_credentials()

        return {
            'type': 'ir.actions.client',
            'tag': 'reload',
        }
