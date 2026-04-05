# Part of Odoo. See LICENSE file for full copyright and licensing details.

from stdnum.it import codicefiscale, iva

from odoo import api, fields, models, _
from odoo.exceptions import UserError


class ResPartner(models.Model):
    _inherit = 'res.partner'

    invoice_edi_format = fields.Selection(selection_add=[('it_edi_xml', 'Italy (Factura PA)')])

    def _l10n_it_edi_is_public_administration(self):
        """ Returns True if the destination of the FatturaPA belongs to the Public Administration. """
        self.ensure_one()
        return self.country_id.code == 'IT' and len((self.additional_identifiers or {}).get('IT_IPA') or '') == 6

    def _l10n_it_edi_get_values(self):
        """ Generates all partner values needed by l10n_it_edi XML export.

            VAT number:
            If there is a VAT number and the partner is not in EU, then we use the VAT number as is,
                as an alphanumeric value identifying the counterparty, up to a maximum of
                28 alphanumeric characters, on which the SdI does not perform validity checks.
            If there is a VAT number and the partner is in EU, then remove the country prefix
            If there is no VAT and the partner is not in EU, then the exported value is 'OO99999999999'
            If there is no VAT and the partner is in EU, then the exported value is '0000000'
            If there is no VAT and the partner is in Italy, the VAT is not set and Codice Fiscale will be relevant in the XML.
            If there is no VAT and no Codice Fiscale, the invoice is not even exported, so this case is not handled.

            Country:
            First, try and deduct the country from the VAT number.
            If not, take the country directly from the partner.
            If there's a codice fiscale, the country is 'IT'.

            PA Index:
            If the partner is in Italy, then the IT_IPA identifier is used, and '0000000' if missing.
            If the partner is not in Italy, the default 'XXXXXXX' is used.

            Codice Fiscale:
            If the Tax Code is equal to the Italian VAT, it may mistakenly have the country prefix,
            so we try and remove it if we can

            Zip(code):
            Non-italian countries are not mapped by the Tax Agency, so it's fixed at '00000'
        """
        if not self or len(self) > 1:
            return {}

        codice_fiscale = (self.additional_identifiers or {}).get('IT_CF')
        pa_index_raw = (self.additional_identifiers or {}).get('IT_IPA')

        europe = self.env.ref('base.europe', raise_if_not_found=False)
        in_eu = not europe or not self.country_id or self.country_id in europe.country_ids
        is_sm = self.country_id and self.country_id.code == "SM"

        # VAT number and country code
        normalized_vat = self.vat
        normalized_country = self.country_code
        if has_vat := self.vat not in [False, '/', 'NA']:
            normalized_vat = self.vat.replace(' ', '')
            if in_eu:
                # If there is no country-code prefix, it's domestic to Italy
                if normalized_vat[:2].isdecimal():
                    if not normalized_country:
                        normalized_country = 'IT'
                # If the partner is from the EU, the country-code prefix of the VAT must be taken away
                else:
                    if not normalized_country:
                        normalized_country = normalized_vat[:2].upper()
                    normalized_vat = normalized_vat[2:]
            # If customer is from San Marino
            elif is_sm:
                normalized_vat = normalized_vat if normalized_vat[:2].isdecimal() else normalized_vat[2:]

        # If it has a codice fiscale (and no country), it's an Italian partner
        if not normalized_country and codice_fiscale:
            normalized_country = 'IT'
        elif not has_vat and self.country_id and self.country_id.code != 'IT':
            if in_eu:
                normalized_vat = '0000000'
            else:
                normalized_vat = 'OO99999999999'

        if normalized_country == 'IT':
            pa_index = (pa_index_raw or '0000000').upper()
            zipcode = self.zip
            state_code = self.state_id and self.state_id.code
        else:
            # San Marino is externally integrated with the SdI.
            # The country as a whole has a single fixed Destination Code.
            # https://www.agenziaentrate.gov.it/portale/documents/20143/3788702/Modifiche+ProvvedimentonSanMarino+0248717-2021.pdf/429b5571-17b9-0cce-7f62-f79cf53086d7
            pa_index = '2R4GTO8' if is_sm else 'XXXXXXX'
            zipcode = '00000'
            state_code = False

        return {
            'codice_fiscale': self._l10n_it_edi_normalized_codice_fiscale(),
            'vat': normalized_vat,
            'country_code': normalized_country,
            'state_code': state_code,
            'pa_index': pa_index,
            'zip': zipcode,
            'in_eu': in_eu,
            'is_company': self.is_company,
            'first_name': ' '.join(self.name.split()[:1]),
            'last_name': ' '.join(self.name.split()[1:]),
        }

    def _l10n_it_edi_normalized_codice_fiscale(self, codice_fiscale=None):
        """ Normalize the Italian Tax Code for export.
            If the Tax Code is equal to the Italian VAT, it may mistakenly have the country prefix,
            so we try and remove it if we can
        """
        if codice_fiscale is None:
            self.ensure_one()
            codice_fiscale = (self.additional_identifiers or {}).get('IT_CF')
        if codice_fiscale:
            if codicefiscale._code_re.match(codice_fiscale):
                # Personal codice
                return codicefiscale.compact(codice_fiscale)
            # Company codice
            return iva.compact(codice_fiscale)

    @api.onchange('vat', 'country_id')
    def _l10n_it_onchange_vat(self):
        if self.vat and (
            self.country_code == "IT"
            if self.country_code
            else self.vat.startswith("IT")
        ):
            normalized = self._l10n_it_edi_normalized_codice_fiscale(self.vat)
            existing = dict(self.additional_identifiers or {})
            if normalized:
                existing['IT_CF'] = normalized
            else:
                existing.pop('IT_CF', None)
            self.additional_identifiers = existing or False
        else:
            existing = dict(self.additional_identifiers or {})
            existing.pop('IT_CF', None)
            self.additional_identifiers = existing or False

    @api.constrains('additional_identifiers')
    def validate_codice_fiscale(self):
        for record in self:
            codice_fiscale = (record.additional_identifiers or {}).get('IT_CF')
            if codice_fiscale and (not codicefiscale.is_valid(codice_fiscale) and not iva.is_valid(codice_fiscale)):
                raise UserError(_("Invalid Codice Fiscale '%s': should be like 'MRTMTT91D08F205J' for physical person and '12345670546' for businesses.", codice_fiscale))

    def _l10n_it_edi_export_check(self, checks=None):
        checks = checks or ['partner_vat_codice_fiscale_missing', 'partner_address_missing']
        single_views = [(False, 'form')]
        list_view = (self.env.ref('l10n_it_edi.res_partner_tree_l10n_it', raise_if_not_found=False))
        multi_views = [(list_view.id if list_view else False, 'list'), (False, 'form')]
        errors = {}

        def _add_error(key, message, invalid_records):
            if invalid_records:
                views = single_views if len(invalid_records) == 1 else multi_views
                errors[f"l10n_it_edi_{key}"] = {
                    'message': message,
                    'action_text': _("View Partner(s)"),
                    'action': invalid_records._get_records_action(name=_("Check Partner(s)"), views=views),
                }

        if 'partner_vat_missing' in checks:
            _add_error('partner_vat_missing',
                       _("Partner(s) should have a VAT number."),
                       self.filtered(lambda r: not r.vat))

        if 'partner_vat_codice_fiscale_missing' in checks:
            _add_error('partner_vat_codice_fiscale_missing',
                       _("Partner(s) should have a VAT number or Codice Fiscale."),
                       self.filtered(lambda r: not r.vat and not (r.additional_identifiers or {}).get('IT_CF')))

        if 'partner_country_missing' in checks:
            _add_error('partner_country_missing',
                       _("Partner(s) should have a Country when used for simplified invoices."),
                       self.filtered(lambda r: not r.country_id))

        if 'partner_address_missing' in checks:
            _add_error('partner_address_missing',
                       _("Partner(s) should have a complete address, verify their Street, City, Zipcode and Country."),
                       self.filtered(lambda r: not (r.street or r.street2) or not r.zip or not r.city or not r.country_id))

        return errors

    def _compute_is_company(self):
        l10n_it_partners = self.filtered(lambda p: p.vat and p.country_code == 'IT')
        for partner in l10n_it_partners:
            partner.is_company = False
            codice_fiscale = (partner.additional_identifiers or {}).get('IT_CF')
            if codice_fiscale and len(codice_fiscale) == 11:
                partner.is_company = True

        super(ResPartner, self - l10n_it_partners)._compute_is_company()

    def _deduce_country_code(self):
        if (self.additional_identifiers or {}).get('IT_CF'):
            return 'IT'
        return super()._deduce_country_code()

    def _peppol_eas_endpoint_depends(self):
        # extends account_edi_ubl_cii
        # additional_identifiers is already included in the base depends
        return super()._peppol_eas_endpoint_depends()

    def _get_frontend_writable_fields(self):
        frontend_writable_fields = super()._get_frontend_writable_fields()
        frontend_writable_fields.update({'additional_identifiers'})

        return frontend_writable_fields

    def _get_suggested_invoice_edi_format(self):
        # EXTENDS 'account'
        res = super()._get_suggested_invoice_edi_format()
        if self.country_code == 'IT':
            return 'it_edi_xml'
        else:
            return res

    def _create_parent_from_name(self, parent_name, additional_values=None):
        parent_company = super()._create_parent_from_name(parent_name=parent_name, additional_values=additional_values)
        if parent_company:
            it_values = self._convert_fields_to_values(('additional_identifiers',))
            parent_company.update(it_values)
        return parent_company
