import re

from odoo.http import request

from odoo.addons.account.controllers.portal import PortalAccount


class L10nSAPortalAccount(PortalAccount):

    def _is_sa_company(self):
        return request.env.company.account_fiscal_country_id.code == 'SA'

    def _prepare_address_form_values(self, partner_sudo, *args, **kwargs):
        # EXTENDS portal
        rendering_values = super()._prepare_address_form_values(partner_sudo, *args, **kwargs)
        if self._is_sa_company():
            rendering_values.update({
                'identification_schemes': dict(request.env['res.partner']._fields['l10n_sa_edi_additional_identification_scheme']._description_selection(request.env)).items(),
            })

        return rendering_values

    def _validate_address_values(self, address_values, partner_sudo, address_type, *args, **kwargs):
        # EXTENDS portal
        def _is_four_digits(val):
            return re.fullmatch(r"\d{4}", val)

        invalid_fields, missing_fields, error_messages = super()._validate_address_values(
            address_values, partner_sudo, address_type, *args, **kwargs,
        )

        if self._is_sa_company() and address_type == 'billing' and request.env['res.country'].browse(int(address_values.get('country_id'))).code == 'SA':
            # Check if building number and plot identification are filled if vat is filled and are 4 digits
            check_missing_fields = {
                'l10n_sa_edi_building_number',
                'l10n_sa_edi_plot_identification',
                'l10n_sa_edi_additional_identification_scheme',
                'l10n_sa_edi_additional_identification_number',
            }
            check_four_digit_fields = {'l10n_sa_edi_building_number', 'l10n_sa_edi_plot_identification'}

            for field in check_four_digit_fields:
                if field_val := address_values.get(field):
                    if not _is_four_digits(field_val):
                        invalid_fields.add(field)
                        error_messages.append(request.env._("%s needs to be four digits", request.env['res.partner']._fields[field].string))

            if address_values['vat']:
                for field in check_missing_fields:
                    if field == 'l10n_sa_edi_additional_identification_number' and address_values.get('l10n_sa_edi_additional_identification_scheme') == 'TIN':
                        # Special Case: identification number doesn't need to be filled if scheme is TIN
                        continue
                    if not address_values.get(field):
                        missing_fields.add(field)
                        error_messages.append(request.env._("%s needs to be filled since the VAT is filled", request.env['res.partner']._fields[field].string))

        return invalid_fields, missing_fields, error_messages
