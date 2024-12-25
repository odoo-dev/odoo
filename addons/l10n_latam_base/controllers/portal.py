# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.http import request

from odoo.addons.portal.controllers.portal import CustomerPortal


class L10nLatamBaseCustomerPortal(CustomerPortal):

    def _prepare_portal_layout_values(self):
        # EXTEND 'portal'
        portal_layout_values = super()._prepare_portal_layout_values()
        if self.env['res.partner']._is_latam_country():
            partner = request.env.user.partner_id
            portal_layout_values.update({
                'identification': partner.l10n_latam_identification_type_id,
                'identification_types': request.env['l10n_latam.identification.type'].search(
                    ['|', ('country_id', '=', False), ('country_id.code', '=', request.env.company.country_code)],
                ),
                'is_latam_country': True,
            })

        return portal_layout_values

    def details_form_validate(self, data, partner_creation=False):
        # EXTEND 'portal'
        error, error_message = super().details_form_validate(data, partner_creation)

        # sanitize identification values to make sure it's correctly written on the partner
        if self.env['res.partner']._is_latam_country():
            if data.get('l10n_latam_identification_type_id'):
                data['l10n_latam_identification_type_id'] = int(data['l10n_latam_identification_type_id'])

        return error, error_message

    def _get_mandatory_billing_address_fields(self, country_sudo):
        """ Extend mandatory fields to add new identification and responsibility fields when company is argentina. """
        mandatory_fields = super()._get_mandatory_billing_address_fields(country_sudo)
        if self.env['res.partner']._is_latam_country():
            mandatory_fields |= {
                'l10n_latam_identification_type_id',
                'vat',
            }
        return mandatory_fields

    def _prepare_address_form_values(self, partner_sudo, address_type, **kwargs):
        rendering_values = super()._prepare_address_form_values(
            partner_sudo, address_type, **kwargs
        )
        if self.env['res.partner']._is_latam_country() and (self._is_used_as_billing_address(address_type, **kwargs)):
            can_edit_vat = rendering_values['can_edit_vat']
            LatamIdentificationType = request.env['l10n_latam.identification.type'].sudo()
            rendering_values.update({
                'identification_types': LatamIdentificationType.search([
                    '|', ('country_id', '=', False), ('country_id.code', '=', request.env.company.country_code),
                ]) if can_edit_vat else LatamIdentificationType,
                'vat_label': request.env._("Identification Number"),
                'is_latam_country': True,
            })
        return rendering_values

    def _get_vat_validation_fields(self):
        fnames = super()._get_vat_validation_fields()
        if self.env['res.partner']._is_latam_country():
            fnames.add('name')
            fnames.add('l10n_latam_identification_type_id')
        return fnames

    def _validate_address_values(self, address_values, partner_sudo, address_type, *args, **kwargs):
        """ We extend the method to add a new validation. If AFIP Resposibility is:

        * Final Consumer or Foreign Customer: then it can select any identification type.
        * Any other (Monotributista, RI, etc): should select always "CUIT" identification type
        """
        invalid_fields, missing_fields, error_messages = super()._validate_address_values(
            address_values, partner_sudo, address_type, *args, **kwargs
        )
        # Identification type and AFIP Responsibility Combination
        if address_type == 'billing' and self.env['res.partner']._is_latam_country():
            if missing_fields and 'l10n_latam_identification_type_id' in missing_fields:
                return invalid_fields, missing_fields, error_messages

            id_type = request.env['l10n_latam.identification.type'].browse(
                address_values.get('l10n_latam_identification_type_id')
            )

            if not id_type:
                return invalid_fields, missing_fields, error_messages

        return invalid_fields, missing_fields, error_messages
