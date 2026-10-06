from odoo import api, fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    l10n_uz_tax_regime = fields.Selection(
        related='company_id.l10n_uz_tax_regime',
        readonly=False,
    )
    l10n_uz_turnover_tax_rate = fields.Selection(
        related='company_id.l10n_uz_turnover_tax_rate',
        readonly=False,
    )

    @api.onchange('l10n_uz_tax_regime')
    def _onchange_l10n_uz_tax_regime(self):
        if self.company_id.chart_template != 'uz' or not self.l10n_uz_tax_regime:
            return
        sale_tax, purchase_tax = self.company_id._l10n_uz_get_regime_default_taxes(self.l10n_uz_tax_regime)
        if sale_tax is not None:
            self.sale_tax_id = sale_tax
        if purchase_tax is not None:
            self.purchase_tax_id = purchase_tax
