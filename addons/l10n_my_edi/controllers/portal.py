# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo.http import request

from odoo.addons.account.controllers.portal import PortalAccount
from odoo.addons.l10n_my_edi.models.res_partner import MY_IDENTIFIER_SCHEME, MY_SCHEME_TO_CODE

# Labels matching the old Selection field, kept for UI consistency
_MY_IDENTIFICATION_TYPE_LABELS = {
    'NRIC': 'MyKad/MyTentera/MyPR/MyKAS',
    'BRN': 'Business Registration Number',
    'PASSPORT': 'Passport',
    'ARMY': 'Army',
}


class PortalAccountMy(PortalAccount):

    def _prepare_my_account_rendering_values(self, *args, **kwargs):
        # EXTENDS 'portal'
        rendering_values = super()._prepare_my_account_rendering_values(*args, **kwargs)
        partner_sudo = rendering_values['partner_sudo']
        id_type, id_val = partner_sudo._l10n_my_get_identification()
        rendering_values.update({
            'l10n_my_identification_types': _MY_IDENTIFICATION_TYPE_LABELS,
            'l10n_my_current_identification_type': id_type or '',
            'l10n_my_current_identification_number': id_val or '',
            'l10n_my_edi_industrial_classifications': request.env['l10n_my_edi.industry_classification'].sudo().search([]),
        })
        return rendering_values

    def _handle_extra_form_data(self, extra_form_data, address_values):
        # EXTENDS 'portal'
        # Convert the HTML form params l10n_my_identification_type + l10n_my_identification_number
        # back into additional_identifiers.
        id_type = extra_form_data.pop('l10n_my_identification_type', None)
        id_val = extra_form_data.pop('l10n_my_identification_number', None)
        if id_type and id_type in MY_SCHEME_TO_CODE:
            code = MY_SCHEME_TO_CODE[id_type]
            existing = address_values.get('additional_identifiers') or {}
            # Remove all MY_* keys then set the new one
            new_identifiers = {k: v for k, v in existing.items() if k not in MY_IDENTIFIER_SCHEME}
            if id_val:
                new_identifiers[code] = id_val
            address_values['additional_identifiers'] = new_identifiers or False
        return super()._handle_extra_form_data(extra_form_data, address_values)
