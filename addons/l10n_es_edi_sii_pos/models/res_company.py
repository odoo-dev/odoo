from odoo import api, fields, models


class ResCompany(models.Model):
    _inherit = 'res.company'

    l10n_es_sii_required = fields.Boolean(
        string="SII Required",
        compute="_compute_l10n_es_sii_required",
        store=True
    )

    @api.depends('l10n_es_sii_tax_agency')
    def _compute_l10n_es_sii_required(self):
        for company in self:
            company.l10n_es_sii_required = bool(company.l10n_es_sii_tax_agency)
