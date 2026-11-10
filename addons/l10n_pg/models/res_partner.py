# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, models


class ResPartner(models.Model):
    _inherit = 'res.partner'

    @api.depends('additional_identifiers', 'country_code')
    def _compute_is_company(self):
        # In Papua New Guinea, individuals also have a TIN: only the IPA registration makes a company.
        pg_partners = self.filtered(lambda p: p.country_code == 'PG')
        for partner in pg_partners:
            partner.is_company = (
                partner.commercial_partner_id == partner
                and bool((partner.additional_identifiers or {}).get('PG_IPA'))
            )
        super(ResPartner, self - pg_partners)._compute_is_company()
