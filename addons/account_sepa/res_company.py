# -*- coding: utf-8 -*-

from openerp import models, fields, api, _

class res_company(models.Model):
    _inherit = "res.company"

    sepa_initiating_party_name = fields.Char('Initiating Party', size=70, default=lambda self: self.env.user.company_id.name,
        help="Will appear in SEPA payments as the name of the party initiating the payment.")

    def _get_ISO_20022_organisation_identification(self):
        """ Returns values for the fields 'Identification' and 'Issuer' of an 'OrganisationIdentification', as described in ISO 20022
            Because the values are country-specific, this method is intended to be extended in l10n_xx modules.
        """
        # TODO: move this implementation in l10n_be, just keep return False
        if self.partner_id.country_id.code == 'BE' and self.partner_id.vat:
            return {
                'Identification': self.partner_id.vat[:2].upper() + self.partner_id.vat[2:].replace(' ', ''),
                'Issuer': 'KBO-BCE'
            }
        return False
