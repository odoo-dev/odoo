from datetime import timedelta

from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    l10n_pl_edi_batch_enabled = fields.Boolean(
        string="KSeF batch download",
        config_parameter='l10n_pl_edi_batch.enabled',
    )

    def set_values(self):
        super().set_values()
        if self.l10n_pl_edi_batch_enabled:
            self.env['res.company'].sudo().search([]).l10n_pl_edi_batch_historic_date = (
                fields.Datetime.start_of(fields.Datetime.now(), 'day') - timedelta(days=1)
            )
