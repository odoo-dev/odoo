from odoo import api, fields, models


class BaseDocumentLayout(models.TransientModel):
    _inherit = 'base.document.layout'

    country_code = fields.Char(related="company_id.account_fiscal_country_id.code")
    l10n_in_upi_id = fields.Char(related='company_id.l10n_in_upi_id', readonly=False)

    @api.onchange('l10n_in_upi_id')
    def _onchange_l10n_in_upi_id(self):
        qr_code = not self.qr_code and self.l10n_in_upi_id
        if self.qr_code != qr_code:
            self.qr_code = qr_code
