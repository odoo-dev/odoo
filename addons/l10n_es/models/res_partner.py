import re

from odoo import models
from odoo import api, fields, models
from odoo.tools.business_data import split_vat


class ResPartner(models.Model):
    _inherit = 'res.partner'

    l10n_es_passport = fields.Char(
        string='Pasaporte',
        compute='_compute_l10n_es_passport',
        inverse='_inverse_l10n_es_passport',
    )
    l10n_es_foreign_id = fields.Char(
        string='Doc. identificación país de residencia',
        compute='_compute_l10n_es_foreign_id',
        inverse='_inverse_l10n_es_foreign_id',
    )
    l10n_es_res_cert = fields.Char(
        string='Certificado de residencia',
        compute='_compute_l10n_es_res_cert',
        inverse='_inverse_l10n_es_res_cert',
    )
    l10n_es_other_id = fields.Char(
        string='Otro doc. probatorio',
        compute='_compute_l10n_es_other_id',
        inverse='_inverse_l10n_es_other_id',
    )

    # ── ES_PASSPORT ──────────────────────────────────────────────────────
    @api.depends('additional_identifiers')
    def _compute_l10n_es_passport(self):
        for partner in self:
            partner.l10n_es_passport = partner._get_additional_identifier('ES_PASSPORT')

    def _inverse_l10n_es_passport(self):
        for partner in self:
            partner._set_additional_identifier('ES_PASSPORT', partner.l10n_es_passport)

    # ── ES_FOREIGN_ID ─────────────────────────────────────────────────────
    @api.depends('additional_identifiers')
    def _compute_l10n_es_foreign_id(self):
        for partner in self:
            partner.l10n_es_foreign_id = partner._get_additional_identifier('ES_FOREIGN_ID')

    def _inverse_l10n_es_foreign_id(self):
        for partner in self:
            partner._set_additional_identifier('ES_FOREIGN_ID', partner.l10n_es_foreign_id)

    # ── ES_RES_CERT ───────────────────────────────────────────────────────
    @api.depends('additional_identifiers')
    def _compute_l10n_es_res_cert(self):
        for partner in self:
            partner.l10n_es_res_cert = partner._get_additional_identifier('ES_RES_CERT')

    def _inverse_l10n_es_res_cert(self):
        for partner in self:
            partner._set_additional_identifier('ES_RES_CERT', partner.l10n_es_res_cert)

    # ── ES_OTHER_ID ───────────────────────────────────────────────────────
    @api.depends('additional_identifiers')
    def _compute_l10n_es_other_id(self):
        for partner in self:
            partner.l10n_es_other_id = partner._get_additional_identifier('ES_OTHER_ID')

    def _inverse_l10n_es_other_id(self):
        for partner in self:
            partner._set_additional_identifier('ES_OTHER_ID', partner.l10n_es_other_id)

    def _l10n_es_is_foreign(self):
        self.ensure_one()
        return self.country_id.code not in ('ES', False) or (self.vat or '').upper().startswith(("ESN", "N"))

    def _l10n_es_freelancer(self):
        self.ensure_one()
        if not self.vat:
            return False

        vat = split_vat(self.vat, default_country_code='ES')[1]

        return re.fullmatch(r"(\d{8}[TRWAGMYFPDXBNJZSQVHLCKE]|[XYZ]\d{7}[TRWAGMYFPDXBNJZSQVHLCKE]|E\d{7}[A-J0-9])", vat) or False

    def _l10n_es_edi_get_partner_info(self):
        """ Used in SII and Veri*factu"""
        self.ensure_one()
        eu_country_codes = set(self.env.ref('base.europe').country_ids.mapped('code'))

        partner_info = {}
        IDOtro_ID = self.vat or 'NO_DISPONIBLE'

        if (not self.country_id or self.country_id.code == 'ES') and self.vat:
            # ES partner with VAT.
            partner_info['NIF'] = self.vat.removeprefix('ES')
            if self.env.context.get('error_1117'):
                partner_info['IDOtro'] = {'IDType': '07', 'ID': IDOtro_ID}

        elif self.country_id.code in eu_country_codes and self.vat:
            # European partner.
            partner_info['IDOtro'] = {'IDType': '02', 'ID': IDOtro_ID}

        else:
            # Extranjero (no UE o sin VAT): hay que aportar documento.
            id_otro = {}
            if self.country_id:
                id_otro['CodigoPais'] = self.country_id.code

            if self.l10n_es_passport:
                id_otro['IDType'] = '03'   # Pasaporte
                id_otro['ID'] = self.l10n_es_passport
            elif self.l10n_es_foreign_id:
                id_otro['IDType'] = '04'   # Doc. oficial país de residencia
                id_otro['ID'] = self.l10n_es_foreign_id
            elif self.l10n_es_res_cert:
                id_otro['IDType'] = '05'   # Certificado de residencia
                id_otro['ID'] = self.l10n_es_res_cert
            elif self.l10n_es_other_id:
                id_otro['IDType'] = '06'   # Otro doc. probatorio
                id_otro['ID'] = self.l10n_es_other_id
            elif self.vat:
                id_otro['IDType'] = '04'   # VAT no comunitario → doc. oficial
                id_otro['ID'] = self.vat
            else:
                id_otro['IDType'] = '06'   # sin nada → otro doc. probatorio
                id_otro['ID'] = IDOtro_ID

            partner_info['IDOtro'] = id_otro

        return partner_info

    def _compute_is_company(self):
        """
        Determines if the Spanish VAT corresponds to a legal entity (CIF format):
        CIF = 1 letter + 7 digits + checksum (digit or letter) (e.g., A1234567Y)
        """
        super()._compute_is_company()
        for partner in self:
            country_code, _ = split_vat(partner.vat)
            if partner.commercial_partner_id == partner and (country_code == 'ES' or (not country_code and partner.country_code == 'ES')):
                partner.is_company = not partner._l10n_es_freelancer()

    def _get_mandatory_billing_address_fields(self, country_sudo, **kwargs):
        """Require VAT/NIF for Spanish customers in billing addresses on Spanish e-commerce."""
        field_names = super()._get_mandatory_billing_address_fields(country_sudo, **kwargs)

        if self.env.company.country_code == country_sudo.code == 'ES':
            field_names.add('vat')

        return field_names

    def _get_mandatory_address_fields(self, country_sudo, **kwargs):
        """Require State for Spanish customers on Spanish e-commerce."""
        field_names = super()._get_mandatory_address_fields(country_sudo, **kwargs)

        if self.env.company.country_code == country_sudo.code == 'ES':
            field_names.add('state_id')

        return field_names

    @api.model
    def _get_all_additional_identifiers_metadata(self):
        # OJO: super() devuelve el dict de módulo (ADDITIONAL_IDENTIFIERS_METADATA),
        # no una copia. Usa {**...} para NO mutar la constante global.
        return {
            **super()._get_all_additional_identifiers_metadata(),
            'ES_PASSPORT': {
                'sequence': 100,
                'label': 'Pasaporte',
                'category': 'CN',
                'countries': False,
            },
            'ES_FOREIGN_ID': {
                'sequence': 110,
                'label': 'Doc. identificación país de residencia',
                'category': 'CN',
                'countries': False,
            },
            'ES_RES_CERT': {
                'sequence': 120,
                'label': 'Certificado de residencia',
                'category': 'CN',
                'countries': False,
            },
            'ES_OTHER_ID': {
                'sequence': 130,
                'label': 'Otro doc. probatorio',
                'category': 'CN',
                'countries': False,
            },
        }
