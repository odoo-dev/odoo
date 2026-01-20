import logging
import re
from base64 import b64decode

from odoo import api, fields, models
from odoo.exceptions import UserError
from odoo.tools.facade import Proxy, ProxyAttr, ProxyFunc

_logger = logging.getLogger(__name__)

try:
    import vobject.vcard
except ImportError:
    _logger.warning("`vobject` Python module not found, vcard file generation disabled. Consider installing this module if you want to generate vcard files")
    vobject = None


if vobject is not None:

    class VBaseProxy(Proxy):
        _wrapped__ = vobject.base.VBase

        encoding_param = ProxyAttr()
        type_param = ProxyAttr()
        value = ProxyAttr(None)

    class VCardContentsProxy(Proxy):
        _wrapped__ = dict

        __delitem__ = ProxyFunc()
        __contains__ = ProxyFunc()
        get = ProxyFunc(lambda lines: [VBaseProxy(line) for line in lines])

    class VComponentProxy(Proxy):
        _wrapped__ = vobject.base.Component

        add = ProxyFunc(VBaseProxy)
        contents = ProxyAttr(VCardContentsProxy)
        serialize = ProxyFunc()


EAS_ICP_MAPPING = {
    # 'bl_default': {'eas': '0002'},
    # 'ch_default': {'eas': '0183'},
    # 'fi_default': {'eas': '0216'},
    # 'fr_default': {'eas': '0002'},
    # 'gf_default': {'eas': '0002'},
    # 'gp_default': {'eas': '0002'},
    # 'mf_default': {'eas': '0002'},
    # 'mq_default': {'eas': '0002'},
    # 'my_default': {'eas': '0230'},
    # 'nc_default': {'eas': '0002'},
    # 'nl_default': {'eas': '0190'},
    # 'pf_default': {'eas': '0002'},
    # 'pm_default': {'eas': '0002'},
    # 're_default': {'eas': '0002'},
    # 'tf_default': {'eas': '0002'},
    # 'wf_default': {'eas': '0002'},
    # 'yt_default': {'eas': '0002'},

    # EU VAT
    'at_vat': {'eas': '9915', 'icp': '9915'},
    'be_vat': {'eas': '9925', 'icp': '9925'},
    'bg_vat': {'eas': '9926', 'icp': '9926'},
    'hr_vat': {'eas': '9934', 'icp': '9934'},
    'cy_vat': {'eas': '9928', 'icp': '9928'},
    'cz_vat': {'eas': '9929', 'icp': '9929'},
    'dk_vat': {'eas': '0198', 'icp': '0184'},  # CVR Number
    'ee_vat': {'eas': '9931', 'icp': '9931'},
    'fi_vat': {'eas': '0213', 'icp': '0213'},  # Finnish VAT
    'fr_vat': {'eas': '9957', 'icp': '9957'},
    'de_vat': {'eas': '9930', 'icp': '9930'},
    'gr_vat': {'eas': '9933', 'icp': '9933'},
    'ie_vat': {'eas': '9935', 'icp': '9935'},
    'it_vat': {'eas': '0211', 'icp': '0211'},  # Partita IVA
    'lv_vat': {'eas': '9939', 'icp': '9939'},
    'lt_vat': {'eas': '9937', 'icp': '9937'},
    'lu_vat': {'eas': '9938', 'icp': '9938'},
    'mt_vat': {'eas': '9943', 'icp': '9943'},
    'nl_vat': {'eas': '0106', 'icp': '0106'},  # Verrekening (VAT)
    'pl_vat': {'eas': '9945', 'icp': '9945'},
    'pt_vat': {'eas': '9946', 'icp': '9946'},
    'ro_vat': {'eas': '9947', 'icp': '9947'},
    'sk_vat': {'eas': '9950', 'icp': '9950'},
    'si_vat': {'eas': '9949', 'icp': '9949'},
    'es_vat': {'eas': '9920', 'icp': '9920'},
    'se_vat': {'eas': '9955', 'icp': '9955'},

    # Non-EU VAT
    'al_vat': {'eas': '9923'},
    'ad_vat': {'eas': '9922'},
    'ae_vat': {'eas': '0235'},
    'au_vat': {'eas': '0151', 'icp': '0151'},
    'ba_vat': {'eas': '9924'},
    'bl_vat': {'eas': '9957'},
    'ch_vat': {'eas': '9927'},
    'gb_vat': {'eas': '9932'},
    'gf_vat': {'eas': '9957'},
    'gp_vat': {'eas': '9957'},
    'is_vat': {'eas': '0196'},
    'jp_vat': {'eas': '0221'},
    'li_vat': {'eas': '9936'},
    'mc_vat': {'eas': '9940'},
    'me_vat': {'eas': '9941'},
    'mf_vat': {'eas': '9957'},
    'mk_vat': {'eas': '9942'},
    'mq_vat': {'eas': '9957'},
    'nc_vat': {'eas': '9957'},
    'pf_vat': {'eas': '9957'},
    'pm_vat': {'eas': '9957'},
    're_vat': {'eas': '9957'},
    'rs_vat': {'eas': '9948'},
    'sm_vat': {'eas': '9951'},
    'tf_vat': {'eas': '9957'},
    'tr_vat': {'eas': '9952'},
    'va_vat': {'eas': '9953'},
    'wf_vat': {'eas': '9957'},
    'yt_vat': {'eas': '9957'},

    # Registries
    '_company_registry': {'eas': None, 'icp': None},
    'be_company_registry': {'eas': '0208', 'icp': '0208'},
    'fr_company_registry': {'eas': '0009', 'icp': '0009'},
    'hr_company_registry': {'eas': '0088', 'icp': '0088'},  # GLN fallback
    'lv_company_registry': {'eas': '0218', 'icp': '0218'},
    'nl_company_registry': {'eas': '0106', 'icp': '0106'},  # Or 0190 for OIN
    'se_company_registry': {'eas': '0007', 'icp': '0007'},
    'nz_company_registry': {'eas': '0088', 'icp': '0088'},

    # Others
    '_siret': {'eas': '0009', 'icp': '0009'},
    '_gst': {'eas': None, 'icp': None},
    '_gln': {'eas': '0088', 'icp': '0088'},
    'de_mail': {'eas': 'EM', 'icp': None},
}


ADDITIONAL_INDENTIFIERS = {
    '_company_registry': {
        'label': "Company Registry",
        'countries': False,
    },
    '_gst': {
        'label': "Good and service tax",
        'countries': False,
    },
    '_gln': {
        'label': "Global Location Number",
        'countries': False,
    },
    '_siret': {
        'label': "SIRET",
        'countries': ['BL', 'GF', 'GP', 'MF', 'MQ', 'NC', 'PF', 'PM', 'RE', 'TF', 'WF', 'YT'],
        'validation_method': lambda partner, self: True,
    },
    'nl_oin': {
        'label': "Organisatie Indentificatie Nummer (OIN)",
        'countries': ['NL'],
        'validation_regex': r'.*',
        'icp': '0190',
        'eas': '0190',
    },
    'nl_kvk': {
        'label': "'Vereniging van Kamers van Koophandel en Fabrieken in Nederland"
                 " (Association of Chambers of Commerce and Industry in the Netherlands),"
                 " Scheme (EDIRA compliant)'",
        'countries': ['NL'],
        'icp': '0106',
        'eas': '0106',
    },
    'sg_l10n_sg_unique_entity_number': {
        'label': 'sg_l10n_sg_unique_entity_number',
        'countries': ['SG'],
        'eas': '0195',
    },
    'hu_l10n_hu_eu_vat': {
        'label': 'hu_l10n_hu_eu_vat',
        'countries': ['HU'],
        'eas': '9910',
    },
    'it_l10n_it_codice_fiscale': {
        'label': 'it_l10n_it_codice_fiscale',
        'countries': ['IT'],
        'eas': '0210',
    },
    'no_l10n_no_bronnoysund_number': {
        'label': 'no_l10n_no_bronnoysund_number',
        'countries': ['NO'],
        'eas': '0192',
    },
}


class ResPartner(models.Model):
    _inherit = 'res.partner'

    additional_identifiers = fields.Json('Additional identifiers', copy=False)

    @api.model
    def get_available_identifiers(self):
        available_identifiers = [
            (i, val['label'], val['countries'])
            for i, val in ADDITIONAL_INDENTIFIERS.items()
        ]
        return available_identifiers

    def write(self, vals):
        if 'additional_identifiers' in vals:
            invalid_identifiers = []

            new_identifiers = {identifier['key']: identifier['value'] for identifier in vals['additional_identifiers']}
            for partner in self:
                previous_identifiers = {identifier['key']: identifier['value'] for identifier in (partner.additional_identifiers or {})}
                to_check = [(k, v) for k, v in new_identifiers.items() if k not in previous_identifiers or previous_identifiers[k] != v]

                for key, val in to_check:
                    identifier_country_codes = ADDITIONAL_INDENTIFIERS[key].get('countries')
                    if identifier_country_codes and (partner.country_code or '') not in identifier_country_codes:
                        invalid_identifiers.append((partner, key, identifier_country_codes))

                    validation_method = ADDITIONAL_INDENTIFIERS[key].get('validation_method')
                    if validation_method and not validation_method(partner, val):
                        invalid_identifiers.append((partner, key, val))

                    validation_regex = ADDITIONAL_INDENTIFIERS[key].get('validation_regex')
                    if validation_regex and not re.match(validation_regex, val):
                        invalid_identifiers.append((partner, key, val))

            if invalid_identifiers:
                raise UserError("Not good identifiers")

        # identifiers = self._get_party_identifiers()
        return super().write(vals)

    def _get_party_identifiers(self):
        self.ensure_one()
        country_code = (self.country_code or '').lower()

        identifiers = {}

        # VAT
        if (vat_schemes := EAS_ICP_MAPPING.get(f'{country_code}_vat')) and self.vat:
            identifiers[f'{country_code}_vat'] = {
                '_text': self.vat,
                **vat_schemes,
            }

        # Peppol Endpoint
        if self.peppol_eas and self.peppol_endpoint:
            identifiers['peppol_identifier'] = {
                '_text': self.peppol_endpoint,
                'eas': self.peppol_eas,
            }

        # ADDITIONAL_IDENTIFIERS
        for identifier in self.additional_identifiers:

            if country_code and identifier['key'].startswith(f'{country_code}_'):  # Country specific identifier
                k = identifier['key']
                eas = ADDITIONAL_INDENTIFIERS[k].get('eas')
                icp = ADDITIONAL_INDENTIFIERS[k].get('icp')

            elif identifier['key'].startswith('_'):  # Multi-country identifier
                k = country_code + identifier['key']
                eas = EAS_ICP_MAPPING.get(k, EAS_ICP_MAPPING.get(identifier['key'])).get('eas')
                icp = EAS_ICP_MAPPING.get(k, EAS_ICP_MAPPING.get(identifier['key'])).get('icp')

            else:  # Irrelevant identifier (should never happen)
                continue

            identifiers[k] = {
                '_text': identifier['value'],
                'icp': icp,
                'eas': eas,
            }

        return identifiers

    def _build_vcard(self):
        """ Build the partner's vCard.
            :returns a vobject.vCard object
        """
        if not vobject:
            return False
        vcard = vobject.vCard()
        # Name
        n = vcard.add('n')
        n.value = vobject.vcard.Name(family=self.name or self.complete_name or '')
        # Formatted Name
        fn = vcard.add('fn')
        fn.value = self.name or self.complete_name or ''
        # Address
        adr = vcard.add('adr')
        adr.value = vobject.vcard.Address(street=self.street or '', city=self.city or '', code=self.zip or '')
        if self.state_id:
            adr.value.region = self.state_id.name
        if self.country_id:
            adr.value.country = self.country_id.name
        # Email
        if self.email:
            email = vcard.add('email')
            email.value = self.email
            email.type_param = 'INTERNET'
        # Telephone numbers
        if self.phone:
            tel = vcard.add('tel')
            tel.type_param = 'work'
            tel.value = self.phone
        # URL
        if self.website:
            url = vcard.add('url')
            url.value = self.website
        # Organisation
        if self.parent_name:
            org = vcard.add('org')
            org.value = [self.parent_name]
        if self.function:
            function = vcard.add('title')
            function.value = self.function
        # Photo
        photo = vcard.add('photo')
        photo.value = b64decode(self.avatar_512)
        photo.encoding_param = 'B'
        photo.type_param = 'JPG'
        return VComponentProxy(vcard)

    def _get_vcard_file(self):
        vcard = self._build_vcard()
        if vcard:
            return vcard.serialize().encode()
        return False
