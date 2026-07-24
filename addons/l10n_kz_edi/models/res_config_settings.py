# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    l10n_kz_edi_environment = fields.Selection(
        related='company_id.l10n_kz_edi_environment',
        readonly=False,
    )
    l10n_kz_edi_vat_certificate_series = fields.Char(
        related='company_id.l10n_kz_edi_vat_certificate_series',
        readonly=False,
    )
    l10n_kz_edi_vat_certificate_num = fields.Char(
        related='company_id.l10n_kz_edi_vat_certificate_num',
        readonly=False,
    )

    def action_l10n_kz_edi_test_connection(self):
        """Open the OWL client action that runs the 3-check connection test."""
        self.ensure_one()
        return {
            'type': 'ir.actions.client',
            'name': self.env._("ESF Connection Test"),
            'tag': 'l10n_kz_edi_test_connection',
            'target': 'new',
            'params': {
                'environment': self.l10n_kz_edi_environment,
                'company_id': self.company_id.id,
            },
        }
