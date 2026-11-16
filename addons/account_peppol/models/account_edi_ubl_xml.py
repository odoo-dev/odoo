from odoo import models


class AccountEdiXmlUBL(models.AbstractModel):
    _inherit = 'account.edi.ubl'

    def _export_get_parties(self, vals):
        """
        When generating the XML on behalf of the parent peppol company,
        use the parent company details on the XML.
        """
        # EXTENDS account_edi_cii
        supplier, customer, delivery = super()._export_get_parties(vals)
        company = vals['company']
        if (
            (parent_peppol_company := company.peppol_parent_company_id)
            and supplier.commercial_partner_id == company.partner_id.commercial_partner_id
        ):
            supplier = parent_peppol_company.partner_id.commercial_partner_id
        return supplier, customer, delivery
