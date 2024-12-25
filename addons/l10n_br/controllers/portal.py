# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _lt
from odoo.http import request

from odoo.addons.account.controllers.portal import CustomerPortal

class CustomerPortalBr(CustomerPortal):

    def _is_brazilean_fiscal_country(self):
        return request.env.company.account_fiscal_country_id.code == 'BR'

    def _is_brazilean_country(self):
        return request.env.company.country_code == 'BR'

    def _get_mandatory_fields(self):
        """ Extend mandatory fields to add the vat in case the company and the customer are from brazil. """
        mandatory_fields = super()._get_mandatory_fields()

        if request.params.get('country_id'):
            country = request.env['res.country'].browse(int(request.params['country_id']))
            if  self._is_brazilean_country() and country.code == "BR" and "vat" not in mandatory_fields:
                mandatory_fields += ['vat']
            # Needed because the user could put brazil and then change to another country, we don't
            # want the field to stay mandatory
            elif 'vat' in mandatory_fields and country.code != 'BR':
                mandatory_fields.remove('vat')

        return mandatory_fields

    def _get_optional_fields(self):
        """Extend optional fields to add the identification type to avoid having the unknown field error"""
        optional_fields = super()._get_optional_fields()
        if self._is_brazilean_country() and 'l10n_latam_identification_type_id' not in optional_fields:
            optional_fields += ['l10n_latam_identification_type_id']
        return optional_fields

    def details_form_validate(self, data, partner_creation=False):
        error, error_message = super().details_form_validate(data, partner_creation)

        # This is needed so that the field is correctly write on the partner
        if data.get('l10n_latam_identification_type_id') and self._is_brazilean_country():
            data['l10n_latam_identification_type_id'] = int(data['l10n_latam_identification_type_id'])
        return error, error_message

    def _prepare_portal_layout_values(self):
        portal_layout_values = super()._prepare_portal_layout_values()
        if self._is_brazilean_fiscal_country():
            portal_layout_values['identification_types'] = request.env['l10n_latam.identification.type'].search(
                ['|', ('country_id', '=', False), ('country_id.code', '=', 'BR')]
            )
        return portal_layout_values

    def _get_mandatory_delivery_address_fields(self, country_sudo):
        mandatory_fields = super()._get_mandatory_delivery_address_fields(country_sudo)
        if (country_sudo.code == 'BR' and self._is_brazilean_fiscal_country()):
            mandatory_fields |= {
                'vat', 'l10n_latam_identification_type_id', 'street_name', 'street2', 'street_number', 'zip', 'city_id', 'state_id', 'country_id'
            }
            mandatory_fields -= {'street', 'city'}  # Brazil uses the base_extended_address fields added above

        return mandatory_fields

    def _get_mandatory_billing_address_fields(self, country_sudo):
        """ Extend mandatory fields to add the vat in case the company and the customer are from brazil. """
        mandatory_fields = super()._get_mandatory_billing_address_fields(country_sudo)

        if (country_sudo.code == 'BR' and self._is_brazilean_fiscal_country()):
            mandatory_fields |= {
                'vat', 'l10n_latam_identification_type_id', 'street_name', 'street2', 'street_number', 'zip', 'city_id', 'state_id', 'country_id'
            }
            mandatory_fields -= {'street', 'city'}  # Brazil uses the base_extended_address fields added above

        return mandatory_fields

    def _prepare_address_form_values(self, partner_sudo, address_type, **kwargs):
        rendering_values = super()._prepare_address_form_values(
            partner_sudo, address_type, **kwargs
        )
        if self._is_used_as_billing_address(address_type, **kwargs) and self._is_brazilean_fiscal_country():
            can_edit_vat = rendering_values['can_edit_vat']
            LatamIdentificationType = request.env['l10n_latam.identification.type'].sudo()
            rendering_values.update({
                'identification_types': LatamIdentificationType.search([
                    '|', ('country_id', '=', False), ('country_id.code', '=', 'BR'),
                ]) if can_edit_vat else LatamIdentificationType,
            })
            rendering_values['city_sudo'] = partner_sudo.city_id
            rendering_values['cities_sudo'] = request.env['res.city'].sudo().search([('country_id.code', '=', 'BR')])
            rendering_values['vat_label'] = _lt('Number')
        return rendering_values
