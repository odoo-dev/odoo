# Part of Odoo. See LICENSE file for full copyright and licensing details.

from stdnum.it import codicefiscale, iva

from odoo import _
from odoo.exceptions import UserError
from odoo.http import request

from odoo.addons.account.controllers.portal import PortalAccount


class L10nITPortalAccount(PortalAccount):

    def _handle_extra_form_data(self, extra_form_data, address_values):
        # EXTENDS 'portal'
        # Convert l10n_it_codice_fiscale and l10n_it_pa_index HTML form params
        # into additional_identifiers.
        codice_fiscale = extra_form_data.pop('l10n_it_codice_fiscale', None) or address_values.pop('l10n_it_codice_fiscale', None)
        pa_index = extra_form_data.pop('l10n_it_pa_index', None) or address_values.pop('l10n_it_pa_index', None)
        if codice_fiscale is not None or pa_index is not None:
            existing = dict(address_values.get('additional_identifiers') or {})
            if codice_fiscale:
                existing['IT_CF'] = codice_fiscale.upper()
            elif codice_fiscale == '':
                existing.pop('IT_CF', None)
            if pa_index:
                existing['IT_IPA'] = pa_index.upper()
            elif pa_index == '':
                existing.pop('IT_IPA', None)
            address_values['additional_identifiers'] = existing or False
        return super()._handle_extra_form_data(extra_form_data, address_values)

    def _validate_address_values(self, address_values, *args, **kwargs):
        invalid_fields, missing_fields, error_messages = super()._validate_address_values(
            address_values, *args, **kwargs
        )

        additional_identifiers = address_values.get('additional_identifiers') or {}

        cf_value = additional_identifiers.get('IT_CF')
        if cf_value:
            partner_dummy = request.env['res.partner'].new({
                'additional_identifiers': {'IT_CF': cf_value}
            })
            try:
                partner_dummy.validate_codice_fiscale()
            except UserError as e:
                invalid_fields.add('l10n_it_codice_fiscale')
                error_messages.append(e.args)

        pa_index = additional_identifiers.get('IT_IPA')
        if pa_index and (len(pa_index) < 6 or len(pa_index) > 7):
            invalid_fields.add('l10n_it_pa_index')
            error_messages.append(_("Destination Code (SDI) must have between 6 and 7 characters."))

        return invalid_fields, missing_fields, error_messages
