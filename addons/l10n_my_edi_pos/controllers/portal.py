from odoo.http import request

from odoo.addons.account.controllers.portal import PortalAccount
from odoo.addons.l10n_my_edi.controllers.portal import _MY_IDENTIFICATION_TYPE_LABELS
from odoo.addons.l10n_my_edi.models.res_partner import MY_IDENTIFIER_SCHEME, MY_SCHEME_TO_CODE


class L10nMYPortalAccount(PortalAccount):

    def _prepare_address_form_values(self, partner_sudo, *args, **kwargs):
        rendering_values = super()._prepare_address_form_values(partner_sudo, *args, **kwargs)

        # BRN applies only to companies; exclude it from the individual selector
        l10n_my_identification_types = {k: v for k, v in _MY_IDENTIFICATION_TYPE_LABELS.items() if k != 'BRN'}
        default_classification = request.env.ref(
            'l10n_my_edi.class_00000', raise_if_not_found=False,
        )
        id_type, id_val = (partner_sudo or request.env['res.partner'])._l10n_my_get_identification()
        rendering_values.update({
            'l10n_my_identification_types': l10n_my_identification_types,
            'l10n_my_current_identification_type': id_type or '',
            'l10n_my_current_identification_number': id_val or '',
            'l10n_my_edi_industrial_classifications': request.env['l10n_my_edi.industry_classification'].sudo().search([]),
            'default_industrial_classification_id': default_classification.id if default_classification else False,
        })
        return rendering_values

    def _parse_form_data(self, form_data):
        address_values, extra_form_data = super()._parse_form_data(form_data)

        is_my_user = (
            request.env['res.country'].browse(address_values.get('country_id'))
            .exists().code == 'MY'
        )

        # After field removal, these are no longer model fields; they come through extra_form_data
        id_type = extra_form_data.pop('l10n_my_identification_type', None) or address_values.pop('l10n_my_identification_type', None)
        id_number = extra_form_data.pop('l10n_my_identification_number', None) or address_values.pop('l10n_my_identification_number', None)

        # MyInvois requires VAT, identification number and type; placeholders are used in certain cases which are handled below.
        if form_data.get('company_type') == 'person':
            vat_type = 'vat' if is_my_user else 'l10n_my_edi_malaysian_tin'
            if not address_values.get(vat_type) and id_number:
                address_values[vat_type] = 'EI00000000010'
            if not id_number and address_values.get(vat_type) and is_my_user:
                id_number = '000000000000'
                id_type = id_type or 'NRIC'

        if form_data.get('company_type') == 'company':
            id_type = 'BRN'
            if not is_my_user and not id_number:
                id_number = '000000000000'

        # Convert to additional_identifiers
        if id_type and id_type in MY_SCHEME_TO_CODE:
            code = MY_SCHEME_TO_CODE[id_type]
            existing = address_values.get('additional_identifiers') or {}
            new_identifiers = {k: v for k, v in existing.items() if k not in MY_IDENTIFIER_SCHEME}
            if id_number:
                new_identifiers[code] = id_number
            address_values['additional_identifiers'] = new_identifiers or False

        return address_values, extra_form_data

    def _validate_address_values(self, address_values, partner_sudo, address_type, *args, **kwargs):
        invalid_fields, missing_fields, error_messages = super()._validate_address_values(
            address_values, partner_sudo, address_type, *args, **kwargs
        )

        _ = self.env._
        is_my_user = (
            request.env['res.country'].browse(address_values.get('country_id'))
            .exists().code == 'MY'
        )
        company_type = request.params.get('company_type')

        # Extract identification from additional_identifiers (set by _parse_form_data)
        additional_identifiers = address_values.get('additional_identifiers') or {}
        id_type = id_number = None
        for code, scheme in MY_IDENTIFIER_SCHEME.items():
            val = additional_identifiers.get(code)
            if val:
                id_type = scheme
                id_number = val
                break

        def _validate_required_fields(fields, message):
            missing = [field for field in fields if not address_values.get(field)]
            if missing:
                missing_fields.update(missing)
                error_messages.append(message)

        if id_number and (
            (id_type in ('NRIC', 'ARMY', 'PASSPORT') and len(id_number) > 12)
            or (id_type == 'BRN' and len(id_number) > 20)
        ):
            missing_fields.add('l10n_my_identification_number')
            error_messages.append(_("Please add a valid identification number"))

        if company_type == 'person':
            if is_my_user:
                if not id_number and not address_values.get('vat'):
                    missing_fields.update(['l10n_my_identification_number', 'vat'])
                    error_messages.append(_("Please provide at least an Identification Number or a TIN (Income Tax Number) to issue an invoice"))
            else:
                if not id_number or id_type != 'PASSPORT':
                    error_messages.append(_("Some fields are missing or have wrong values"))
                    if not id_number:
                        missing_fields.add('l10n_my_identification_number')
                    if id_type != 'PASSPORT':
                        missing_fields.add('l10n_my_identification_type')

        elif company_type == 'company':
            if is_my_user:
                missing = []
                if not id_number:
                    missing.append('l10n_my_identification_number')
                if not address_values.get('vat'):
                    missing.append('vat')
                if missing:
                    missing_fields.update(missing)
                    error_messages.append(_("Please enter your Business Registration Number (BRN) and TIN (Income Tax Number) to proceed."))
            else:
                _validate_required_fields(
                    ['l10n_my_edi_malaysian_tin'],
                    _("Malaysian VAT is required to process invoice"),
                )

        return invalid_fields, missing_fields, error_messages

    def _get_mandatory_address_fields(self, country_sudo):
        field_names = super()._get_mandatory_address_fields(country_sudo)

        if country_sudo.code == 'MY':
            field_names.add('state_id')

        return field_names
