# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, models
from odoo.tools.translate import LazyTranslate

_lt = LazyTranslate(__name__)


class ResPartner(models.Model):
    _inherit = "res.partner"

    _l10n_pe_pos_consumidor_final = models.Ref(
        'l10n_pe_pos.partner_pe_cf', 'res.partner',
        message=_lt("Deleting the partner %(name)s is not allowed because it is required by the Peruvian point of sale."),
    )

    @api.model
    def _load_pos_data_fields(self, config):
        fields = super()._load_pos_data_fields(config)
        if self.env.company.country_id.code == "PE":
            fields += ["city_id", "l10n_pe_district"]
        return fields
