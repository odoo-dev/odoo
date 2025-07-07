from odoo import models


class ResPartner(models.Model):
    _inherit = 'res.partner'

    def update_gst_treatment_from_partner_autocomplete(self):
        response = self.enrich_by_gst(self.vat)
        self.l10n_in_gst_treatment = response.get('l10n_in_gst_treatment', 'regular')
