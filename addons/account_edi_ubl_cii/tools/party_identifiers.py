import re
from stdnum.be import vat as be_vat
from odoo.tools.translate import LazyTranslate

_lt = LazyTranslate(__name__)

# -------------------------------------------------------------------------
# DOCUMENTATION:
# - https://docs.peppol.eu/poacc/billing/3.0/codelist/eas/
# -------------------------------------------------------------------------


# TODO check all TIN category
# Notes:
# EAS_MAPPING -> 'HR': {'0088': 'company_registry'}, that's GLN ! Same for NZ.

# FIXME could we use this? No env...
# dom_tom_country_group = env.ref('base.dom-tom', raise_if_not_found=False)
# dom_tom_codes = dom_tom_country_group and dom_tom_country_group.country_ids.mapped('code')
# return ["FR"] + (dom_tom_codes or [])
FR_DOM_TOM = [
    'FR', 'BL', 'GF', 'GP', 'MF', 'MQ', 'NC', 'PF', 'PM', 'RE', 'TF', 'WF', 'YT',
]

# FIXME return env.ref('base.sepa_zone', raise_if_not_found=False).country_ids.mapped('code')
SEPA_COUNTRIES = [
    'AD', 'AT', 'AX', 'BE', 'BG', 'BL', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR',
    'UK', 'GF', 'GG', 'GI', 'GP', 'GR', 'HR', 'HU', 'IE', 'IM', 'IS', 'IT', 'JE', 'LI', 'LT',
    'LU', 'LV', 'MC', 'MF', 'MQ', 'MT', 'NL', 'NO', 'PL', 'PM', 'PT', 'RE', 'RO', 'SE', 'SI',
    'SK', 'SM', 'VA', 'YT',
]

GLN_ISO6523 = '0088'
GLN_VALIDATION_REGEX = re.compile('[0-9]{13}')

TIN_METADATA = {
    'AD_VAT': {
        'iso6523': '9922',
        'category': 'VAT',
        'countries': ['AD'],
    },
    'AE_TIN': {
        'iso6523': '0235',
        'category': 'TIN',
        'countries': ['AE'],
    },
    'AL_TIN': {
        'iso6523': '9923',
        'placeholder': 'ALJ91402501L',
        'category': 'TIN',
        'countries': ['AL'],
    },
    'AR_TIN': {
        'placeholder': '20055361682',
        'category': 'TIN',
        'countries': ['AR'],
    },
    'AT_VAT': {
        'iso6523': '9914',
        'placeholder': 'ATU12345675',
        'category': 'VAT',
        'countries': ['AT'],
    },
    'AU_ABN': {
        'iso6523': '0151',
        'placeholder': '83 914 571 673',
        'category': 'GST',
        'countries': ['AU'],
    },
    'BA_VAT': {
        'iso6523': '9924',
        'category': 'VAT',
        'countries': ['BA'],
    },
    'BE_VAT': {
        'iso6523': '9925',
        'placeholder': 'BE0477472701',
        'category': 'VAT',
        'normalize_regex': re.compile('[^BE0-9]'),
        'countries': ['BE'],
    },
    'BG_VAT': {
        'iso6523': '9926',
        'placeholder': 'BG1234567892',
        'category': 'VAT',
        'countries': ['BG'],
    },
    'BR_TIN': {
        'placeholder': _lt('either 11 digits for CPF or 14 digits for CNPJ'),
        'category': 'TIN',
        'countries': ['BR'],
    },
    'CH_VAT': {
        'iso6523': '9927',
        'placeholder': _lt('CHE-123.456.788 TVA or CHE-123.456.788 MWST or CHE-123.456.788 IVA'),
        'category': 'VAT',
        'countries': ['CH'],
    },
    'CL_TIN': {
        'placeholder': '76086428-5',
        'category': 'TIN',
        'countries': ['CL'],
    },
    'CO_TIN': {
        'placeholder': '213123432-1',
        'category': 'TIN',
        'countries': ['CO'],
    },
    'CR_VAT': {
        'placeholder': '3101012009',
        'category': 'VAT',
        'countries': ['CR'],
    },
    'CY_VAT': {
        'iso6523': '9928',
        'placeholder': 'CY10259033P',
        'category': 'VAT',
        'countries': ['CY'],
    },
    'CZ_VAT': {
        'iso6523': '9929',
        'placeholder': 'CZ12345679',
        'category': 'VAT',
        'countries': ['CZ'],
    },
    'DE_VAT': {
        'iso6523': '9930',
        'placeholder': _lt('DE123456788 or 12/345/67890'),
        'category': 'VAT',
        'countries': ['DE'],
    },
    'DK_VAT': {
        'iso6523': '0184',  # same as DK_CVR
        'placeholder': 'DK12345674',
        'category': 'VAT',
        'countries': ['DK'],
    },
    'DO_TIN': {
        'placeholder': _lt('1-01-85004-3 or 101850043'),
        'category': 'TIN',
        'countries': ['DO'],
    },
    'EC_TIN': {
        'placeholder': _lt('1792060346001 or 1792060346'),
        'category': 'TIN',
        'countries': ['EC'],
    },
    'EE_VAT': {
        'iso6523': '9931',
        'placeholder': 'EE123456780',
        'category': 'VAT',
        'countries': ['EE'],
    },
    'ES_VAT': {
        'iso6523': '9920',
        'placeholder': 'ESA12345674',
        'category': 'VAT',
        'countries': ['ES'],
    },
    'FI_VAT': {
        'iso6523': '0213',
        'placeholder': 'FI12345671',
        'category': 'VAT',
        'countries': ['FI'],
    },
    'FR_VAT': {
        'iso6523': '9957',
        'placeholder': 'FR23334175221',
        'category': 'VAT',
        'countries': FR_DOM_TOM,
    },
    'GB_VAT': {
        'iso6523': '9932',
        'placeholder': _lt('GB123456782 or XI123456782'),
        'category': 'VAT',
        'countries': ['GB'],
    },
    'GR_VAT': {
        'iso6523': '9933',
        'placeholder': 'EL123456783',
        'category': 'VAT',
        'countries': ['GR'],
    },
    'HR_VAT': {
        'iso6523': '9934',
        'placeholder': 'HR01234567896',
        'category': 'VAT',
        'countries': ['HR'],
    },
    'HU_VAT': {  # That's the prefixed with HU VAT - the "EU" version
        'iso6523': '9910',
        'placeholder': 'HU12345676',
        'category': 'VAT',
        'countries': ['HU'],
    },
    'ID_TIN': {
        'placeholder': '1234567890123456',
        'category': 'TIN',
        'countries': ['ID'],
    },
    'IE_VAT': {
        'iso6523': '9935',
        'placeholder': 'IE1234567FA',
        'category': 'VAT',
        'countries': ['IE'],
    },
    'IL_VAT': {
        'placeholder': _lt('XXXXXXXXX [9 digits] and it should respect the Luhn algorithm checksum'),
        'category': 'VAT',
        'countries': ['IL'],
    },
    'IN_GST': {
        'placeholder': '12AAAAA1234AAZA',
        'category': 'GST',
        'countries': ['IN'],
    },
    'IS_VAT': {
        'iso6523': '0196',
        'placeholder': 'IS062199',
        'category': 'VAT',
        'countries': ['IS'],
    },
    'IT_VAT': {
        'iso6523': '0211',
        'label': _lt('IVA'),
        'placeholder': 'IT12345670017',
        'category': 'VAT',
        'countries': ['IT'],
    },
    'JP_VAT': {
        'iso6523': '0221',
        'label': _lt('IIN'),
        'placeholder': 'T7000012050002',
        'category': 'VAT',
        'countries': ['JP'],
    },
    'KR_TIN': {
        'placeholder': _lt('123-45-67890 or 1234567890'),
        'category': 'TIN',
        'countries': ['KR'],
    },
    'LI_VAT': {
        'iso6523': '9936',
        'category': 'VAT',
        'countries': ['LI'],
    },
    'LT_VAT': {
        'iso6523': '9937',
        'placeholder': 'LT123456715',
        'category': 'VAT',
        'countries': ['LT'],
    },
    'LU_VAT': {
        'iso6523': '9938',
        'placeholder': 'LU12345613',
        'category': 'VAT',
        'countries': ['LU'],
    },
    'LV_VAT': {
        'iso6523': '9939',
        'placeholder': 'LV41234567891',
        'category': 'VAT',
        'countries': ['LV'],
    },
    'MA_TIN': {
        'placeholder': '12345678',
        'category': 'TIN',
        'countries': ['MA'],
    },
    'MC_VAT': {
        'iso6523': '9940',
        'placeholder': 'FR53000004605',
        'category': 'VAT',
        'countries': ['MC'],
    },
    'ME_VAT': {
        'iso6523': '9941',
        'category': 'VAT',
        'countries': ['ME'],
    },
    'MK_VAT': {
        'iso6523': '9942',
        'category': 'VAT',
        'countries': ['MK'],
    },
    'MT_VAT': {
        'iso6523': '9943',
        'placeholder': 'MT12345634',
        'category': 'VAT',
        'countries': ['MT'],
    },
    'MX_TIN': {
        'placeholder': 'GODE561231GR8',
        'category': 'TIN',
        'countries': ['MX'],
    },
    'NG_VAT': {
        'iso6523': '0244',
        'placeholder': '',
        'category': 'VAT',
        'countries': ['NG'],
    },
    'NL_VAT': {
        'iso6523': '9944',
        'placeholder': 'NL123456782B90',
        'category': 'VAT',
        'countries': ['NL'],
    },
    'NO_VAT': {
        'placeholder': 'NO123456785',
        'category': 'VAT',
        'countries': ['NO'],
    },
    'NZ_GST': {
        'placeholder': _lt('49-098-576 or 49098576'),
        'category': 'GST',
        'countries': ['NZ'],
    },
    'PE_TIN': {
        'placeholder': _lt('10XXXXXXXXY or 20XXXXXXXXY or 15XXXXXXXXY or 16XXXXXXXXY or 17XXXXXXXXY'),
        'category': 'TIN',
        'countries': ['PE'],
    },
    'PH_TIN': {
        'placeholder': '123-456-789-123',
        'category': 'TIN',
        'countries': ['PH'],
    },
    'PL_VAT': {
        'iso6523': '9945',
        'placeholder': 'PL1234567883',
        'category': 'VAT',
        'countries': ['PL'],
    },
    'PT_VAT': {
        'iso6523': '9946',
        'placeholder': 'PT123456789',
        'category': 'VAT',
        'countries': ['PT'],
    },
    'RO_VAT': {
        'iso6523': '9947',
        'placeholder': _lt('RO1234567897 or 8001011234567 or 9000123456789'),
        'category': 'VAT',
        'countries': ['RO'],
    },
    'RS_VAT': {
        'iso6523': '9948',
        'placeholder': 'RS101134702',
        'category': 'VAT',
        'countries': ['RS'],
    },
    'RU_TIN': {
        'placeholder': '123456789047',
        'category': 'TIN',
        'countries': ['RU'],
    },
    'SA_TIN': {
        'placeholder': _lt('310175397400003 [Fifteen digits, first and last digits should be "3"]'),
        'category': 'TIN',
        'countries': ['SA'],
    },
    'SE_VAT': {
        'iso6523': '9955',
        'placeholder': 'SE123456789701',
        'category': 'VAT',
        'countries': ['SE'],
    },
    'SI_VAT': {
        'iso6523': '9949',
        'placeholder': 'SI12345679',
        'category': 'VAT',
        'countries': ['SI'],
    },
    'SK_VAT': {
        'iso6523': '9950',
        'placeholder': 'SK2022749619',
        'category': 'VAT',
        'countries': ['SK'],
    },
    'SM_VAT': {
        'iso6523': '9951',
        'placeholder': 'SM24165',
        'category': 'VAT',
        'countries': ['SM'],
    },
    'TH_VAT': {
        'placeholder': '1234545678781',
        'category': 'VAT',
        'countries': ['TH'],
    },
    'TR_VAT': {
        'iso6523': '9952',
        'placeholder': _lt('11111111111 (NIN) or 2222222222 (VKN)'),
        'category': 'VAT',
        'countries': ['TR'],
    },
    'US_TIN': {
        'iso6523': '9959',
        'category': 'TIN',
        'countries': ['US'],
    },
    'UA_VAT': {
        'placeholder': _lt("12345678 or UA12345678 (EDRPOU), 1234567890 (RNOPP) or 123456789012 (IPN)"),
        'category': 'VAT',
        'countries': ['UA'],
    },
    'UY_TIN': {
        'placeholder': _lt("Example: '219999830019' (format: 12 digits, all numbers, valid check digit)"),
        'category': 'TIN',
        'countries': ['UY'],
    },
    'VA_VAT': {
        'iso6523': '9953',
        'category': 'VAT',
        'countries': ['VA'],
    },
    'VE_TIN': {
        'placeholder': 'V-12345678-1, V123456781, V-12.345.678-1',
        'category': 'TIN',
        'countries': ['VE'],
    },
    'XI_TIN': {
        'placeholder': 'XI123456782',
        'category': 'TIN',
        'countries': ['XI'],
    },
}

ADDITIONAL_IDENTIFIERS_METADATA = {
    'AT_EN': {
        # Almost equivalent to 9914, but without "AT" prefix
        'sequence': 10,
        'iso6523': '9915',
        'label': _lt('Company registry'),
        'validation_regex': '',
        'validation_function': '',
        'normalize_regex': '',
        'countries': ['AT'],
    },
    'AU_ACN': {
        'sequence': 10,
        # 'iso6523': '',
        'label': _lt('ACN'),
        'validation_regex': '',
        'validation_function': '',
        'normalize_regex': '',
        'countries': ['AU'],
    },
    'BE_CN': {
        'sequence': 20,
        'iso6523': '0008',
        'label': _lt('Citizen Identification'),
        'placeholder': '123455 555 6',
        'countries': ['BE'],
    },
    'BE_EN': {
        'sequence': 10,
        'iso6523': '0208',
        'label': _lt('BCE/KBO'),
        'placeholder': '0477472701',
        'validation_regex': re.compile('[01][0-9]{9}'),
        'validation_function': be_vat.is_valid,
        'examples': ['0477472701', '1477472701'],
        'normalize_regex': re.compile('[^0-9]'),
        'countries': ['BE'],
    },
    'CH_EN': {
        'sequence': 10,
        'iso6523': '0183',
        'label': _lt('Swiss Unique Business Identification Number (UIDB)'),
        'placeholder': '',
        'validation_regex': '',
        'normalize_regex': '',
        'countries': ['CH'],
    },
    'DE_GEBA': {
        'sequence': 10,
        'iso6523': '0246',
        'label': _lt('German Electronic Business Address'),
        'placeholder': '',
        'validation_regex': '',
        'normalize_regex': '',
        'countries': ['DE'],
    },
    'DE_LTW': {
        # EDI specific to invoice to government
        'sequence': 200,
        'iso6523': '0204',
        'label': _lt('Germany Leitweg-ID'),
        'countries': ['DE'],
    },
    'DK_CVR': {
        # All companies have a CVR number, prefixed or not with "DK".
        # See also SE number (iso6523='0198').
        'sequence': 10,
        'iso6523': '0184',  # same as DK_VAT (one is with prefix, not the other)
        'label': _lt('CVR'),
        'placeholder': '58403288',
        'validation_regex': '',
        'normalize_regex': '',
        'countries': ['DK'],
    },
    'DK_SE': {
        # A company might have multiple SE number for each department, prefixed or not with "DK".
        # Can be used in a VAT context if prefixed with "DK".
        'sequence': 20,
        'iso6523': '0198',
        'label': _lt('SE'),
        'placeholder': '',
        'validation_regex': '',
        'normalize_regex': '',
        'countries': ['DK'],
    },
    'DUNS': {
        'sequence': 100,
        'iso6523': '0060',
        'label': _lt('DUNS Number'),
        'placeholder': '',
        'validation_regex': '',
        'normalize_regex': '',
        'countries': False,
    },
    'EAN_GLN': {
        'sequence': 100,
        'iso6523': GLN_ISO6523,
        'label': _lt('EAN/GLN'),
        'placeholder': '',
        'validation_regex': GLN_VALIDATION_REGEX,
        'normalize_regex': '',
        'countries': False,
    },
    'EE_EN': {
        'sequence': 10,
        'iso6523': '0191',
        'label': _lt('Company registry'),
        'placeholder': '',
        'validation_regex': '',
        'normalize_regex': '',
        'countries': ['EE'],
    },
    'FI_EN': {
        'sequence': 10,
        'iso6523': '0216',
        'label': _lt('Business ID'),
        'placeholder': '8763054-9',
        'validation_regex': '',
        'normalize_regex': '',
        'countries': ['FI'],
    },
    'FR_CN': {
        'sequence': 200,
        'iso6523': '0240',
        'label': _lt('France Register of legal persons'),
        'countries': FR_DOM_TOM,
    },
    'FR_CTC': {
        # EDI specific - French PDP/AP
        'sequence': 30,
        'iso6523': '0225',
        'label': _lt('France FRCTC Electronic Address'),
        'countries': FR_DOM_TOM,
    },
    'FR_SIREN': {
        'sequence': 20,
        'iso6523': '0002',
        'label': _lt('SIREN'),
        'placeholder': '',
        'validation_regex': '',
        'normalize_regex': '',
        'countries': FR_DOM_TOM,
    },
    'FR_SIRET': {
        'sequence': 10,
        'iso6523': '0009',
        'label': _lt('SIRET'),
        'placeholder': '33417522101010',
        'validation_regex': '',
        'normalize_regex': '',
        'countries': FR_DOM_TOM,
    },
    'GS1': {
        'sequence': 200,
        'iso6523': '0209',
        'label': _lt('GS1 identification keys'),
        'countries': False,
    },
    'HR_EN': {
        'sequence': 10,
        'iso6523': GLN_ISO6523,  # under the hood, the HR EN is a GLN
        'label': _lt('HR EN'),
        'placeholder': '',
        'validation_regex': GLN_VALIDATION_REGEX,
        'normalize_regex': '',
        'countries': ['HR'],
    },
    'HU_EN': {
        'sequence': 10,
        'iso6523': '',
        'label': _lt('HR EN'),
        'placeholder': _lt('12345678-1-11 or 8071592153'),
        'validation_regex': GLN_VALIDATION_REGEX,
        'normalize_regex': '',
        'countries': ['HU'],
    },
    'IBAN': {
        # EDI specific don't mix up with account_number
        'sequence': 200,
        'iso6523': '9918',
        'label': _lt('IBAN'),
        'countries': False,
    },
    'IT_CODICE': {
        'sequence': 10,
        'iso6523': '0210',
        'label': _lt('Codice Fiscale'),
        'placeholder': '',
        'validation_regex': re.compile('[a-zA-Z0-9]{8,11}'),
        'normalize_regex': '',
        'countries': ['IT'],
    },
    'JP_EN': {
        'sequence': 10,
        'iso6523': '0188',
        'label': _lt('SST'),
        'placeholder': '7000012050002',
        'validation_regex': '',
        'normalize_regex': '',
        'countries': ['JP'],
    },
    'LEI': {
        'sequence': 100,
        'iso6523': '0199',
        'label': _lt('Legal Entity Identifier (LEI)'),
        'placeholder': '',
        'validation_regex': re.compile('[A-Z0-9]{18,18}[0-9]{2,2}'),
        'normalize_regex': '',
        'countries': SEPA_COUNTRIES,
    },
    'LT_JAK': {
        'sequence': 10,
        'iso6523': '0200',
        'label': _lt('Company registry'),
        'placeholder': '',
        'validation_regex': '',
        'normalize_regex': '',
        'countries': ['LT'],
    },
    'LV_EN': {
        'sequence': 10,
        'iso6523': '0218',
        'label': _lt('Company registry'),
        'placeholder': '',
        'validation_regex': '',
        'normalize_regex': '',
        'countries': ['LV'],
    },
    'MA_ICE': {
        'sequence': 10,
        # 'iso6523': '',
        'label': _lt('ICE'),
        'placeholder': '',
        'validation_regex': re.compile('[0-9]{15}'),
        'normalize_regex': '',
        'countries': ['MA'],
    },
    'MY_EN': {
        'sequence': 10,
        'iso6523': '0230',
        'label': _lt('Company registry'),
        'placeholder': '',
        'validation_regex': '',
        'normalize_regex': '',
        'countries': ['MY'],
    },
    'NL_KVK': {
        'sequence': 10,
        'iso6523': '0106',
        'label': _lt('KVK'),
        'placeholder': '',
        'validation_regex': '',
        'normalize_regex': '',
        'countries': ['NL'],
    },
    'NL_OIN': {
        'sequence': 20,
        'iso6523': '0190',
        'label': _lt('OIN'),
        'placeholder': '',
        'validation_regex': '',
        'normalize_regex': '',
        'countries': ['NL'],
    },
    'NO_EN': {
        'sequence': 10,
        'iso6523': '0192',
        'label': _lt('Register of Legal Entities (Brønnøysund Register Center)'),
        'placeholder': '',
        'validation_regex': '',
        'normalize_regex': '',
        'countries': ['NO'],
    },
    'NZ_EN': {
        'sequence': 10,
        'iso6523': GLN_ISO6523,  # under the hood, the NZ BN is a GLN
        'label': _lt('NZBN'),
        'placeholder': '',
        'validation_regex': GLN_VALIDATION_REGEX,
        'normalize_regex': '',
        'countries': ['NZ'],
    },
    'SE_EN': {
        'sequence': 10,
        'iso6523': '0007',
        'label': _lt('Company registry'),
        'placeholder': '',
        'validation_regex': '',
        'normalize_regex': '',
        'countries': ['SE'],
    },
    'SG_EN': {
        'sequence': 10,
        'iso6523': '0195',
        'label': _lt('UEN'),
        'placeholder': '',
        'validation_regex': '',
        'normalize_regex': '',
        'countries': ['SG'],
    },
    'SK_EN': {
        'sequence': 10,
        'iso6523': '0245',
        'label': _lt('Company registry'),
        'placeholder': '',
        'validation_regex': '',
        'normalize_regex': '',
        'countries': ['SK'],
    },
}

    # FIXME Can't be registered on Peppol - not sure what to do with it.
    # ('AN', "O.F.T.P. (ODETTE File Transfer Protocol)"),
    # ('AQ', "X.400 address for mail text"),
    # ('AS', "AS2 exchange"),
    # ('AU', "File Transfer Protocol"),
    # ('EM', "Electronic mail"),


def get_tin_label_of_country(country_code):
    # We suppose there is only one Tax Identification Number per country and return the first from found.
    return get_tin_metadata_of_country(country_code).get('label')


def get_tin_placeholder_of_country(country_code):
    # We suppose there is only one Tax Identification Number per country and return the first from found.
    return get_tin_metadata_of_country(country_code).get('placeholder')


def get_tin_metadata_of_country(country_code):
    for key, metadata in TIN_METADATA.items():
        if country_code in (TIN_METADATA[key].get('countries') or []):
            return {'key': key, **metadata}
    return {}


def get_identifier_metadata(identifier_type):
    return TIN_METADATA.get(identifier_type) or ADDITIONAL_IDENTIFIERS_METADATA.get(identifier_type) or {}


def get_identifier_metadata_of_country(country_code, include_international=True, seq_min=0, seq_max=100):
    return {
        key: values
        for key, values in ADDITIONAL_IDENTIFIERS_METADATA.items()
        if seq_min <= values.get('sequence', 100) <= seq_max and (
            country_code in (values.get('countries') or [])
            or (include_international and not values.get('countries'))
        )
    }


def get_deduced_tins(key, value):
    deduced = {}
    if key == 'BE_EN':
        deduced['BE_VAT'] = non_prefixed_to_prefixed_identifier('BE', value)
    if key == 'AT_EN':
        deduced['AT_VAT'] = non_prefixed_to_prefixed_identifier('AT', value)
    if key == 'DK_CVR':
        deduced['DK_VAT'] = non_prefixed_to_prefixed_identifier('DK', value)
    return deduced


def get_deduced_additional_identifiers(key, value):
    deduced = {}
    if key == 'BE_VAT':
        deduced['BE_EN'] = prefixed_to_non_prefixed_identifier('BE', value)
    if key == 'AT_VAT':
        deduced['AT_EN'] = prefixed_to_non_prefixed_identifier('AT', value)
    if key == 'DK_VAT':
        deduced['DK_CVR'] = prefixed_to_non_prefixed_identifier('DK', value)
    return deduced


def non_prefixed_to_prefixed_identifier(country_code, value):
    # suppose value is well formatted
    if country_code == 'HU':
        return f'{country_code}{value[:8]}'
    return f'{country_code}{value}'


def prefixed_to_non_prefixed_identifier(country_code, value):
    # suppose value is well formatted
    return value.removeprefix(country_code)


def validate_identifier(identifier_type, value):
    metadata = get_identifier_metadata(identifier_type)
    example = metadata.get('examples')
    # Apply normalization (typically remove space,.,-).
    normalize_regex = metadata.get('normalize_regex')
    if normalize_regex:
        value = normalize_regex.sub('', value)
    # Validation based on regex.
    regex_validation = metadata.get('validation_regex')
    if regex_validation and not re.fullmatch(regex_validation, value):
        return {'valid': False, 'value': value, 'example': example}
    # Validation based on specific function. /!\ the function should not raise
    function_validation = metadata.get('validation_function')
    if function_validation and not function_validation(value):
        return {'valid': False, 'value': value, 'example': example}
    return {'valid': True, 'value': value, 'example': example}


def normalize_identifier(identifier_type, value):
    return value
    validate_results = validate_identifier(identifier_type, value)
    if validate_results['valid']:
        return validate_results['value']
    return None
