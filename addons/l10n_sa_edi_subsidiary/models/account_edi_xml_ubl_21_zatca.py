# -*- coding: utf-8 -*-
from odoo import models

class AccountEdiXmlUBL21Zatca(models.AbstractModel):
    _inherit = 'account.edi.xml.ubl_21.zatca'

    def _get_partner_party_tax_scheme_vals_list(self, partner, role):
        """
            If the supplier belongs to a VAT group, the group's VAT number should be used instead
        """
        vals_list = super()._get_partner_party_tax_scheme_vals_list(partner, role)
        if role != 'supplier' or not partner.l10n_sa_vat_group_id:
            return vals_list
        
        for vals in vals_list:
            vals['company_id'] = partner.l10n_sa_vat_group_id.vat
        return vals_list
