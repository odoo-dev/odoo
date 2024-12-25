# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.http import request

from odoo.addons.portal.controllers.portal import CustomerPortal


class L10nARCustomerPortal(CustomerPortal):

    def _is_argentine_company(self):
        return request.env.company.country_code == 'AR'

    def _prepare_portal_layout_values(self):
        # EXTEND 'portal'
        portal_layout_values = super()._prepare_portal_layout_values()
        if self._is_argentine_company():
            partner = request.env.user.partner_id
            portal_layout_values.update({
                'responsibility': partner.l10n_ar_afip_responsibility_type_id,
                'responsibility_types': request.env['l10n_ar.afip.responsibility.type'].search([]),
            })

        return portal_layout_values

    def details_form_validate(self, data, partner_creation=False):
        # EXTEND 'portal'
        error, error_message = super().details_form_validate(data, partner_creation)

        # sanitize identification values to make sure it's correctly written on the partner
        if self._is_argentine_company() and data.get('l10n_ar_afip_responsibility_type_id'):
            data['l10n_ar_afip_responsibility_type_id'] = int(data['l10n_ar_afip_responsibility_type_id'])

        return error, error_message

    def _get_mandatory_billing_address_fields(self, country_sudo):
        """ Extend mandatory fields to add new identification and responsibility fields when company is argentina. """
        mandatory_fields = super()._get_mandatory_billing_address_fields(country_sudo)
        if self._is_argentine_company():
            mandatory_fields |= {
                'l10n_ar_afip_responsibility_type_id',
            }
        return mandatory_fields

    def _prepare_address_form_values(self, partner_sudo, address_type, **kwargs):
        rendering_values = super()._prepare_address_form_values(
            partner_sudo, address_type, **kwargs
        )
        if self._is_argentine_company() and (self._is_used_as_billing_address(address_type, **kwargs)):
            can_edit_vat = rendering_values['can_edit_vat']
            rendering_values.update({
                'responsibility_types': request.env['l10n_ar.afip.responsibility.type'].search([]),
            })
        return rendering_values


    def _validate_address_values(self, address_values, partner_sudo, address_type, *args, **kwargs):
        """ We extend the method to add a new validation. If AFIP Resposibility is:

        * Final Consumer or Foreign Customer: then it can select any identification type.
        * Any other (Monotributista, RI, etc): should select always "CUIT" identification type
        """
        invalid_fields, missing_fields, error_messages = super()._validate_address_values(
            address_values, partner_sudo, address_type, *args, **kwargs
        )
        # Identification type and AFIP Responsibility Combination
        if address_type == 'billing' and self._is_argentine_company():
            if missing_fields and 'l10n_ar_afip_responsibility_type_id' in missing_fields:
                return invalid_fields, missing_fields, error_messages

            afip_resp = request.env['l10n_ar.afip.responsibility.type'].browse(
                address_values.get('l10n_ar_afip_responsibility_type_id')
            )

            id_type = request.env['l10n_latam.identification.type'].browse(
                address_values.get('l10n_latam_identification_type_id')
            )

            if not id_type or not afip_resp:
                # Those two values were not provided and are not required, skip the validation
                return invalid_fields, missing_fields, error_messages

            # Check if the AFIP responsibility is different from Final Consumer or Foreign Customer,
            # and if the identification type is different from CUIT
            if afip_resp.code not in ['5', '9'] and id_type != request.env.ref('l10n_ar.it_cuit'):
                invalid_fields.add('l10n_latam_identification_type_id')
                error_messages.append(request.env._(
                    "For the selected AFIP Responsibility you will need to set CUIT Identification Type"
                ))

        return invalid_fields, missing_fields, error_messages
