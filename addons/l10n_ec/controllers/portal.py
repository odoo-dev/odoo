# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.addons.portal.controllers.portal import CustomerPortal
from odoo.http import request


class CustomerPortalEcuador(CustomerPortal):

    def _is_ecuador_company(self):
        return request.env.company.country_code == 'EC'

    def _get_mandatory_fields(self):
        # EXTEND 'portal'
        mandatory_fields = super()._get_mandatory_fields()

        if self._is_ecuador_company():
            mandatory_fields.extend(('l10n_latam_identification_type_id', 'vat'))

        return mandatory_fields

    def _prepare_portal_layout_values(self):
        # EXTEND 'portal'
        portal_layout_values = super()._prepare_portal_layout_values()

        if self._is_ecuador_company():
            partner = request.env.user.partner_id
            portal_layout_values.update({
                'identification': partner.l10n_latam_identification_type_id,
                'identification_types': request.env['l10n_latam.identification.type'].search(
                    ['|', ('country_id', '=', False), ('country_id.code', '=', 'EC')]),
            })

        return portal_layout_values

    def details_form_validate(self, data, partner_creation=False):
        # EXTEND 'portal'
        error, error_message = super().details_form_validate(data, partner_creation)

        # sanitize identification value to make sure it's correctly written on the partner
        if self._is_ecuador_company() and data.get('l10n_latam_identification_type_id'):
            data['l10n_latam_identification_type_id'] = int(data['l10n_latam_identification_type_id'])

        return error, error_message

    def _get_mandatory_billing_address_fields(self, country_sudo):
        mandatory_fields = super()._get_mandatory_billing_address_fields(country_sudo)
        if not self._is_ecuador_company():
            return mandatory_fields

        # For Ecuadorian company, the VAT is required for all the partners
        mandatory_fields.add('vat')
        mandatory_fields.add('l10n_latam_identification_type_id')
        return mandatory_fields

    def _prepare_address_form_values(self, partner_sudo, address_type, **kwargs):
        rendering_values = super()._prepare_address_form_values(
            partner_sudo, address_type, **kwargs,
        )
        if (
            (self._is_used_as_billing_address(address_type, **kwargs))
            and self._is_ecuador_company()
        ):
            can_edit_vat = rendering_values['can_edit_vat']
            LatamIdentificationType = request.env['l10n_latam.identification.type'].sudo()
            rendering_values.update({
                'identification_types': LatamIdentificationType.search([
                    '|', ('country_id', '=', False), ('country_id.code', '=', 'EC')
                ]) if can_edit_vat else LatamIdentificationType,
                'vat_label': request.env._("Identification Number"),
            })

        return rendering_values

    def _get_vat_validation_fields(self):
        fnames = super()._get_vat_validation_fields()
        if self._is_ecuador_company():
            fnames.add('l10n_latam_identification_type_id')
            fnames.add('name')
        return fnames
