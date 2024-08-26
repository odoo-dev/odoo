from odoo import _, models
class AccountEdiXmlOIOUBL201(models.AbstractModel):
    _inherit = 'account.edi.xml.oioubl_201'

    def _get_partner_party_vals(self, partner, role):
        # EXTENDS account.edi.xml.oioubl_201
        vals = super()._get_partner_party_vals(partner, role)
        if partner.l10n_dk_nemhandel_identifier_type and partner.l10n_dk_nemhandel_identifier_value:
            vals.update({
                'endpoint_id': partner.l10n_dk_nemhandel_identifier_type,
                'endpoint_id_attrs': f'DK{partner.l10n_dk_nemhandel_identifier_value}',
            })
        return vals
