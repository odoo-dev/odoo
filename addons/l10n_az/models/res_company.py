from odoo import fields, models


class ResCompany(models.Model):
    _inherit = 'res.company'

    l10n_az_eqf_location_code = fields.Char(
        string="EQF Business Location Code",
        help="Code of the business location (branch/object) issuing the electronic invoices (EQF), as registered "
             "with the State Tax Service.",
    )
    l10n_az_simplified_tax_rate = fields.Float(
        string="Simplified Tax Rate (%)",
        default=2.0,
        help="Rate applied to the quarterly turnover on the Simplified Tax Report. Branches use the rate of their "
             "root company.",
    )

    def _l10n_az_eqf_get_location_address(self):
        """ Build the business location address reported in <ma>, from the company's address.

        :return: the non-empty address parts joined with ', ' (at most 4000 characters), or ''.
        """
        self.ensure_one()
        partner = self.partner_id
        parts = [
            partner.street,
            partner.street2,
            partner.city,
            partner.zip,
            partner.state_id.name,
            partner.country_id.name,
        ]
        return ', '.join(part.strip() for part in parts if part and part.strip())[:4000]
