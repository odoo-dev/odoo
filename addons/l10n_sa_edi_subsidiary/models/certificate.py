from cryptography.x509 import ObjectIdentifier
from cryptography.x509.oid import NameOID

from odoo import api, models

class Certificate(models.Model):
    _inherit = 'certificate.certificate'

    @api.model
    def _l10n_sa_get_csr_vals(self, journal):
        # Call super with the journal's contact (i.e. branch), in case it was different than the main company
        vals = super()._l10n_sa_get_csr_vals(journal, journal.partner_id)

        # If the journal's contact belongs to a VAT group, populate the x509 subject fields accordingly.
        # According to ZATCA guidelines:
        # - The Organizational Unit Name (OU) should contain the 10-digit TIN of the individual group member (i.e., the branch being onboarded).
        # - The Object Identifier 2.5.4.97 should contain the VAT number of the VAT group.
        if journal.partner_id.l10n_sa_vat_group_id:
            vals["subject_names"].update({
                NameOID.ORGANIZATIONAL_UNIT_NAME: journal.partner_id.company_registry,
                ObjectIdentifier('2.5.4.97'): journal.partner_id.l10n_sa_vat_group_id.vat
            })
        return vals
