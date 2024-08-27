from odoo import _, models
class AccountEdiXmlOIOUBL201(models.AbstractModel):
    _inherit = 'account.edi.xml.oioubl_201'

    def _get_partner_party_vals(self, partner, role):
        # EXTENDS account.edi.xml.oioubl_201
        vals = super()._get_partner_party_vals(partner, role)
        if partner.l10n_dk_nemhandel_identifier_type and partner.l10n_dk_nemhandel_identifier_value:
            prefix = 'DK%s' if partner.l10n_dk_nemhandel_identifier_type == 'DK:CVR' else '%s'
            vals.update({
                'endpoint_id': prefix % partner.l10n_dk_nemhandel_identifier_value,
                'endpoint_id_attrs': {'scheme_ID': partner.l10n_dk_nemhandel_identifier_type},
            })
        return vals


    def _get_partner_party_identification_vals_list(self, partner):
        vals = super()._get_partner_party_identification_vals_list(partner)
        if partner.l10n_dk_nemhandel_identifier_type and partner.l10n_dk_nemhandel_identifier_value:
            prefix = 'DK%s' if partner.l10n_dk_nemhandel_identifier_type == 'DK:CVR' else '%s'
            return vals.append({
                'id': prefix % partner.l10n_dk_nemhandel_identifier_value,
                'id_attrs': {'scheme_ID': partner.l10n_dk_nemhandel_identifier_type},
            })

