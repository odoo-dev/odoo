# -*- coding: utf-8 -*-
from odoo import _lt
from stdnum.au import acn as au_acn
from stdnum.fr import siret as fr_siret


FR_AND_TERRITORIES = ['FR', 'PF', 'MF', 'MQ', 'NC', 'RE', 'GF', 'GP', 'TF', 'BL', 'PM', 'YT', 'WF']

IDENTIFIERS_METADATA = {
    # Country-specific (alphabetical by country)
    'AD_VAT': {
        'sequence': 100,
        'label': _lt("Andorra VAT"),
        'placeholder': 'U-137268-F',
        'eas': '9922',
        'type': 'VAT',
        'countries': ['AD'],
    },
    'AE_TIN': {
        'sequence': 100,
        'label': _lt("UAE Tax Identification Number (TIN)"),
        'placeholder': '100412848100003',
        'eas': '0235',
        'type': 'TIN',
        'countries': ['AE'],
    },
    'AL_VAT': {
        'sequence': 100,
        'label': _lt("Albania VAT"),
        'placeholder': 'J91402501L',
        'eas': '9923',
        'type': 'VAT',
        'countries': ['AL'],
    },
    'AT_UID': {
        'sequence': 100,
        'label': _lt("Austria UID"),
        'placeholder': 'ATU13585627',
        'eas': '9914',
        'type': 'VAT',
        'countries': ['AT'],
    },
    'AT_VOKZ': {
        'sequence': 200,
        'label': _lt("Austria VOKZ"),
        'placeholder': '123456789',
        'eas': '9915',
        'countries': ['AT'],
    },
    'AU_ABN': {
        'sequence': 100,
        'label': _lt("Australia ABN"),
        'placeholder': '83 914 571 673',
        'eas': '0151',
        'countries': ['AU'],
    },
    'BA_VAT': {
        'sequence': 100,
        'label': _lt("Bosnia and Herzegovina VAT"),
        'placeholder': '4200425640003',
        'eas': '9924',
        'type': 'VAT',
        'countries': ['BA'],
    },
    'BE_EN': {
        'sequence': 110,
        'label': _lt("Belgian Company Registry"),
        'placeholder': '0487.310.516',
        'eas': '0208',
        'countries': ['BE'],
    },
    'BE_CN': {
        'sequence': 120,
        'label': _lt("Belgian National Number"),
        'placeholder': '84022612345',
        'countries': ['BE'],
    },
    'BE_UBL': {
        'sequence': 200,
        'label': _lt("UBL.BE party identifier"),
        'placeholder': '0487310516',
        'eas': '0193',
        'countries': ['BE'],
    },
    'BE_VAT': {
        'sequence': 100,
        'label': _lt("Belgian VAT"),
        'placeholder': 'BE0487310516',
        'eas': '9925',
        'type': 'VAT',
        'countries': ['BE'],
    },
    'BG_VAT': {
        'sequence': 100,
        'label': _lt("Bulgaria VAT"),
        'placeholder': 'BG175074752',
        'eas': '9926',
        'type': 'VAT',
        'countries': ['BG'],
    },
    'CH_UIDB': {
        'sequence': 110,
        'label': _lt("Swiss UIDB"),
        'placeholder': 'CHE-107.787.577',
        'eas': '0183',
        'countries': ['CH'],
    },
    'CH_VAT': {
        'sequence': 100,
        'label': _lt("Swiss VAT"),
        'placeholder': 'CHE-107.787.577 MWST',
        'eas': '9927',
        'type': 'VAT',
        'countries': ['CH'],
    },
    'CY_VAT': {
        'sequence': 100,
        'label': _lt("Cyprus VAT"),
        'placeholder': 'CY10259033P',
        'eas': '9928',
        'type': 'VAT',
        'countries': ['CY'],
    },
    'CZ_VAT': {
        'sequence': 100,
        'label': _lt("Czech Republic VAT"),
        'placeholder': 'CZ25596641',
        'eas': '9929',
        'type': 'VAT',
        'countries': ['CZ'],
    },
    'DE_EBA': {
        'sequence': 200,
        'label': _lt("German Electronic Business Address"),
        'placeholder': '1234567890',
        'eas': '0246',
        'countries': ['DE'],
    },
    'DE_KUR': {
        'sequence': 200,
        'label': _lt("Kennziffer des Unternehmensregisters"),
        'placeholder': '123456789',
        'eas': '9919',
        'countries': ['DE'],
    },
    'DE_LID': {
        'sequence': 110,
        'label': _lt("Germany Leitweg-ID"),
        'placeholder': '04011000-12345-34',
        'eas': '0204',
        'countries': ['DE'],
    },
    'DE_VAT': {
        'sequence': 100,
        'label': _lt("Germany VAT"),
        'placeholder': 'DE136695976',
        'eas': '9930',
        'type': 'VAT',
        'countries': ['DE'],
    },
    'DK_CVR': {
        'sequence': 100,
        'label': _lt("Denmark CVR"),
        'placeholder': '58403288',
        'eas': '0184',
        'countries': ['DK'],
    },
    'DK_P': {
        'sequence': 200,
        'label': _lt("Denmark P"),
        'placeholder': '1001087266',
        'eas': '0096',
        'countries': ['DK'],
    },
    'DK_SE': {
        'sequence': 110,
        'label': _lt("Denmark SE"),
        'placeholder': '13585628',
        'eas': '0198',
        'countries': ['DK'],
    },
    'EE_CC': {
        'sequence': 110,
        'label': _lt("Estonia Company code"),
        'placeholder': '10137025',
        'eas': '0191',
        'countries': ['EE'],
    },
    'EE_VAT': {
        'sequence': 100,
        'label': _lt("Estonia VAT"),
        'placeholder': 'EE100207015',
        'eas': '9931',
        'type': 'VAT',
        'countries': ['EE'],
    },
    'ES_VAT': {
        'sequence': 100,
        'label': _lt("Spain VAT"),
        'placeholder': 'ESX1234567X',
        'eas': '9920',
        'type': 'VAT',
        'countries': ['ES'],
    },
    'FI_LY': {
        'sequence': 110,
        'label': _lt("Finland LY-tunnus"),
        'placeholder': '8763054-9',
        'eas': '0037',
        'countries': ['FI'],
    },
    'FI_OVT': {
        'sequence': 200,
        'label': _lt("Finland OVT code"),
        'placeholder': '003715904607',
        'eas': '0216',
        'countries': ['FI'],
    },
    'FI_VAT': {
        'sequence': 100,
        'label': _lt("Finland VAT"),
        'placeholder': 'FI15904607',
        'eas': '0213',
        'type': 'VAT',
        'countries': ['FI'],
    },
    'FR_FRCTC': {
        'sequence': 200,
        'label': _lt("France FRCTC Electronic Address"),
        'placeholder': '12345678901234',
        'eas': '0225',
        'countries': FR_AND_TERRITORIES,
    },
    'FR_RLP': {
        'sequence': 200,
        'label': _lt("France Register of legal persons"),
        'placeholder': '123456789',
        'eas': '0240',
        'countries': FR_AND_TERRITORIES,
    },
    'FR_SIREN': {
        'sequence': 110,
        'label': _lt("France SIRENE"),
        'placeholder': '334175221',
        'eas': '0002',
        'countries': FR_AND_TERRITORIES,
    },
    'FR_SIRET': {
        'sequence': 120,
        'label': _lt("France SIRET"),
        'placeholder': '33417522101010',
        'eas': '0009',
        'countries': FR_AND_TERRITORIES,
    },
    'FR_VAT': {
        'sequence': 100,
        'label': _lt("France VAT"),
        'placeholder': 'FR40399710892',
        'eas': '9957',
        'type': 'VAT',
        'countries': FR_AND_TERRITORIES,
    },
    'GB_VAT': {
        'sequence': 100,
        'label': _lt("United Kingdom VAT"),
        'placeholder': 'GB980780684',
        'eas': '9932',
        'type': 'VAT',
        'countries': ['GB'],
    },
    'GR_VAT': {
        'sequence': 100,
        'label': _lt("Greece VAT"),
        'placeholder': 'GR094259216',
        'eas': '9933',
        'type': 'VAT',
        'countries': ['GR'],
    },
    'HR_VAT': {
        'sequence': 100,
        'label': _lt("Croatia VAT"),
        'placeholder': 'HR38562306894',
        'eas': '9934',
        'type': 'VAT',
        'countries': ['HR'],
    },
    'HU_VAT': {
        'sequence': 100,
        'label': _lt("Hungary VAT"),
        'placeholder': 'HU12892312',
        'eas': '9910',
        'type': 'VAT',
        'countries': ['HU'],
    },
    'IE_VAT': {
        'sequence': 100,
        'label': _lt("Ireland VAT"),
        'placeholder': 'IE6433435F',
        'eas': '9935',
        'type': 'VAT',
        'countries': ['IE'],
    },
    'IS_KT': {
        'sequence': 100,
        'label': _lt("Iceland Kennitala"),
        'placeholder': '420169-3849',
        'eas': '0196',
        'countries': ['IS'],
    },
    'IT_CF': {
        'sequence': 110,
        'label': _lt("Codice Fiscale"),
        'placeholder': 'RSSMRA70A01H501W',
        'eas': '0210',
        'countries': ['IT'],
    },
    'IT_FTI': {
        'sequence': 200,
        'label': _lt("Italia FTI"),
        'placeholder': 'IT12345678901',
        'eas': '0097',
        'countries': ['IT'],
    },
    'IT_IPA': {
        'sequence': 200,
        'label': _lt("Codice Univoco Unità Organizzativa iPA"),
        'placeholder': 'c_a123',
        'eas': '0201',
        'countries': ['IT'],
    },
    'IT_PEC': {
        'sequence': 200,
        'label': _lt("Indirizzo di Posta Elettronica Certificata"),
        'placeholder': 'pec@certificata.it',
        'eas': '0202',
        'countries': ['IT'],
    },
    'IT_VAT': {
        'sequence': 100,
        'label': _lt("Italia Partita IVA"),
        'placeholder': 'IT06363391001',
        'eas': '0211',
        'type': 'VAT',
        'countries': ['IT'],
    },
    'JP_IIN': {
        'sequence': 200,
        'label': _lt("Japan IIN"),
        'placeholder': '123456789',
        'eas': '0221',
        'countries': ['JP'],
    },
    'JP_SST': {
        'sequence': 100,
        'label': _lt("Japan SST"),
        'placeholder': '7000012050002',
        'eas': '0188',
        'countries': ['JP'],
    },
    'LI_VAT': {
        'sequence': 100,
        'label': _lt("Liechtenstein VAT"),
        'placeholder': '53011',
        'eas': '9936',
        'type': 'VAT',
        'countries': ['LI'],
    },
    'LT_JAK': {
        'sequence': 110,
        'label': _lt("Lithuania JAK"),
        'placeholder': '123456789',
        'eas': '0200',
        'countries': ['LT'],
    },
    'LT_VAT': {
        'sequence': 100,
        'label': _lt("Lithuania VAT"),
        'placeholder': 'LT100001919014',
        'eas': '9937',
        'type': 'VAT',
        'countries': ['LT'],
    },
    'LU_VAT': {
        'sequence': 100,
        'label': _lt("Luxembourg VAT"),
        'placeholder': 'LU26375245',
        'eas': '9938',
        'type': 'VAT',
        'countries': ['LU'],
    },
    'LV_URN': {
        'sequence': 110,
        'label': _lt("Latvia Unified registration number"),
        'placeholder': '40003009497',
        'eas': '0218',
        'countries': ['LV'],
    },
    'LV_VAT': {
        'sequence': 100,
        'label': _lt("Latvia VAT"),
        'placeholder': 'LV40003009497',
        'eas': '9939',
        'type': 'VAT',
        'countries': ['LV'],
    },
    'MC_VAT': {
        'sequence': 100,
        'label': _lt("Monaco VAT"),
        'placeholder': 'FR53000004605',
        'eas': '9940',
        'type': 'VAT',
        'countries': ['MC'],
    },
    'ME_VAT': {
        'sequence': 100,
        'label': _lt("Montenegro VAT"),
        'placeholder': '02425970',
        'eas': '9941',
        'type': 'VAT',
        'countries': ['ME'],
    },
    'MK_VAT': {
        'sequence': 100,
        'label': _lt("Macedonia VAT"),
        'placeholder': '4030992250212',
        'eas': '9942',
        'type': 'VAT',
        'countries': ['MK'],
    },
    'MT_VAT': {
        'sequence': 100,
        'label': _lt("Malta VAT"),
        'placeholder': 'MT11679112',
        'eas': '9943',
        'type': 'VAT',
        'countries': ['MT'],
    },
    'MY_MYID': {
        'sequence': 100,
        'label': _lt("Malaysia NRIC"),
        'placeholder': '123456-12-1234',
        'eas': '0230',
        'countries': ['MY'],
    },
    'MY_BRN': {
        'sequence': 110,
        'label': _lt("Malaysia Business Registration Number"),
        'placeholder': '202101234567',
        'countries': ['MY'],
    },
    'MY_PASSPORT': {
        'sequence': 120,
        'label': _lt("Malaysia Passport"),
        'placeholder': 'A12345678',
        'countries': ['MY'],
    },
    'MY_ARMY': {
        'sequence': 130,
        'label': _lt("Malaysia Army ID"),
        'placeholder': '880101235137',
        'countries': ['MY'],
    },
    'NG_TIN': {
        'sequence': 100,
        'label': _lt("Nigeria Tax Identification"),
        'placeholder': '10214847-0001',
        'eas': '0244',
        'type': 'TIN',
        'countries': ['NG'],
    },
    'NL_KVK': {
        'sequence': 110,
        'label': _lt("Netherlands KvK"),
        'placeholder': '12345678',
        'eas': '0106',
        'countries': ['NL'],
    },
    'NL_OIN': {
        'sequence': 120,
        'label': _lt("Netherlands OIN"),
        'placeholder': '00000001234567890000',
        'eas': '0190',
        'countries': ['NL'],
    },
    'NL_VAT': {
        'sequence': 100,
        'label': _lt("Netherlands VAT"),
        'placeholder': 'NL123456782B01',
        'eas': '9944',
        'type': 'VAT',
        'countries': ['NL'],
    },
    'NO_EN': {
        'sequence': 100,
        'label': _lt("Norway Org.nr."),
        'placeholder': '981078365',
        'eas': '0192',
        'countries': ['NO'],
    },
    'PL_VAT': {
        'sequence': 100,
        'label': _lt("Poland VAT"),
        'placeholder': 'PL1234567890',
        'eas': '9945',
        'type': 'VAT',
        'countries': ['PL'],
    },
    'PT_VAT': {
        'sequence': 100,
        'label': _lt("Portugal VAT"),
        'placeholder': 'PT501869389',
        'eas': '9946',
        'type': 'VAT',
        'countries': ['PT'],
    },
    'RO_VAT': {
        'sequence': 100,
        'label': _lt("Romania VAT"),
        'placeholder': 'RO12345678',
        'eas': '9947',
        'type': 'VAT',
        'countries': ['RO'],
    },
    'RS_VAT': {
        'sequence': 100,
        'label': _lt("Serbia VAT"),
        'placeholder': 'RS100021966',
        'eas': '9948',
        'type': 'VAT',
        'countries': ['RS'],
    },
    'SE_ORGNR': {
        'sequence': 110,
        'label': _lt("Sweden Org.nr."),
        'placeholder': '556014-2720',
        'eas': '0007',
        'countries': ['SE'],
    },
    'SE_VAT': {
        'sequence': 100,
        'label': _lt("Sweden VAT"),
        'placeholder': 'SE556014272001',
        'eas': '9955',
        'type': 'VAT',
        'countries': ['SE'],
    },
    'SG_UEN': {
        'sequence': 100,
        'label': _lt("Singapore UEN"),
        'placeholder': '201103788W',
        'eas': '0195',
        'countries': ['SG'],
    },
    'SI_VAT': {
        'sequence': 100,
        'label': _lt("Slovenia VAT"),
        'placeholder': 'SI15068940',
        'eas': '9949',
        'type': 'VAT',
        'countries': ['SI'],
    },
    'SK_DIC': {
        'sequence': 110,
        'label': _lt("SK Tax identification number (DIČ)"),
        'placeholder': '2022749619',
        'eas': '0245',
        'type': 'TIN',
        'countries': ['SK'],
    },
    'SK_VAT': {
        'sequence': 100,
        'label': _lt("Slovakia VAT"),
        'placeholder': 'SK2022749619',
        'eas': '9950',
        'type': 'VAT',
        'countries': ['SK'],
    },
    'SM_VAT': {
        'sequence': 100,
        'label': _lt("San Marino VAT"),
        'placeholder': 'SM24006',
        'eas': '9951',
        'type': 'VAT',
        'countries': ['SM'],
    },
    'TR_VAT': {
        'sequence': 100,
        'label': _lt("Turkey VAT"),
        'placeholder': 'TR0020164280',
        'eas': '9952',
        'type': 'VAT',
        'countries': ['TR'],
    },
    'US_EIN': {
        'sequence': 100,
        'label': _lt("USA EIN"),
        'placeholder': '12-3456789',
        'eas': '9959',
        'countries': ['US'],
    },
    'VA_VAT': {
        'sequence': 100,
        'label': _lt("Vatican VAT"),
        'placeholder': 'VA02089441009',
        'eas': '9953',
        'type': 'VAT',
        'countries': ['VA'],
    },

    # International (no country code or generic multiple countries)
    'AS2': {
        'sequence': 200,
        'label': _lt("AS2 exchange"),
        'placeholder': 'AS2_ID_123',
        'eas': 'AS',
        'countries': None,
    },
    'BRN': {
        'sequence': 200,
        'label': _lt("Business Registers Network"),
        'placeholder': '123456789',
        'eas': '9913',
        'countries': None,
    },
    'DUNS': {
        'sequence': 150,
        'label': _lt("DUNS Number"),
        'placeholder': '12-345-6789',
        'eas': '0060',
        'countries': None,
    },
    'EMAIL': {
        'sequence': 200,
        'label': _lt("Electronic mail"),
        'placeholder': 'info@company.com',
        'eas': 'EM',
        'countries': None,
    },
    'EU_DIR': {
        'sequence': 200,
        'label': _lt("Directorates of the European Commission"),
        'placeholder': 'DIR-123',
        'eas': '0130',
        'countries': None,
    },
    'FTP': {
        'sequence': 200,
        'label': _lt("File Transfer Protocol"),
        'placeholder': 'ftp://ftp.company.com',
        'eas': 'AU',
        'countries': None,
    },
    'GLN': {
        'sequence': 150,
        'label': _lt("EAN Location Code (GLN)"),
        'placeholder': '1234567890123',
        'eas': '0088',
        'countries': None,
    },
    'GS1': {
        'sequence': 200,
        'label': _lt("GS1 identification keys"),
        'placeholder': '1234567890123',
        'eas': '0209',
        'countries': None,
    },
    'LEI': {
        'sequence': 150,
        'label': _lt("Legal Entity Identifier (LEI)"),
        'placeholder': '529900T8BM49AURSDO55',
        'eas': '0199',
        'countries': None,
    },
    'OFTP': {
        'sequence': 200,
        'label': _lt("O.F.T.P. (ODETTE File Transfer Protocol)"),
        'placeholder': 'O00130000859D3D00',
        'eas': 'AN',
        'countries': None,
    },
    'SECETI_OID': {
        'sequence': 200,
        'label': _lt("SECETI Object Identifiers"),
        'placeholder': '1.2.3.4.5',
        'eas': '0142',
        'countries': None,
    },
    'SIA_OID': {
        'sequence': 200,
        'label': _lt("SIA Object Identifiers"),
        'placeholder': '1.2.3.4.5',
        'eas': '0135',
        'countries': None,
    },
    'SWIFT': {
        'sequence': 200,
        'label': _lt("S.W.I.F.T"),
        'placeholder': 'ABCDUS33',
        'eas': '9918',
        'countries': None,
    },
    'X400': {
        'sequence': 200,
        'label': _lt("X.400 address for mail text"),
        'placeholder': 'c=US;a= ;p=bns;o=org;s=smith',
        'eas': 'AQ',
        'countries': None,
    },
}

TIN_METADATA = {
    k: v for k, v in IDENTIFIERS_METADATA.items()
    if v.get('type') in ('VAT', 'GST', 'TIN')
}

ADDITIONAL_IDENTIFIERS_METADATA = {
    k: v for k, v in IDENTIFIERS_METADATA.items()
    if v.get('type') not in ('VAT', 'GST', 'TIN')
}

def get_identifier_metadata(identifier_type):
    return IDENTIFIERS_METADATA.get(identifier_type) or {}


def get_tin_metadata_of_country(country_code):
    for key, metadata in TIN_METADATA.items():
        if country_code in (TIN_METADATA[key].get('countries') or []):
            return {'key': key, **metadata}
    return {}


def get_tin_label_of_country(country_code):
    # We suppose there is only one Tax Identification Number per country and return the first from found.
    return get_tin_metadata_of_country(country_code).get('label')


def get_tin_placeholder_of_country(country_code):
    # We suppose there is only one Tax Identification Number per country and return the first from found.
    return get_tin_metadata_of_country(country_code).get('placeholder')


def get_additional_identifiers_metadata_of_country(country_code, include_international=True, seq_min=0, seq_max=100):
    return {
        key: metadata
        for key, metadata in ADDITIONAL_IDENTIFIERS_METADATA.items()
        if seq_min <= metadata.get('sequence', 100) <= seq_max and (
            country_code in (metadata.get('countries') or [])
            or (include_international and not metadata.get('countries'))
        )
    }


def get_deduced_identifiers(key, value):
    deduced = {}
    if key == 'BE_VAT':
        deduced['BE_EN'] = get_non_prefixed_identifier('BE', value)
    if key == 'AT_VAT':
        deduced['AT_EN'] = get_non_prefixed_identifier('AT', value)
    if key == 'AU_ACN':
        deduced['AU_ANB'] = au_acn.to_abn(value)
    if key == 'DK_VAT':
        deduced['DK_CVR'] = get_non_prefixed_identifier('DK', value)
    if key == 'FR_SIRET':
        deduced['FR_SIREN'] = fr_siret.to_siren(value)
        deduced['FR_VAT'] = fr_siret.to_tva(value)
    return deduced


def get_prefixed_identifier(country_code, value):
    if value.startswith(country_code):
        return value  # keep idempotent
    if country_code == 'HU':
        return f'{country_code}{value[:8]}'
    return f'{country_code}{value}'


def get_non_prefixed_identifier(country_code, value):
    if not value.startswith(country_code):
        return value  # keep idempotent
    return value.removeprefix(country_code)

def is_identifier_void(identifier):
    if not identifier:
        return True
    return identifier in ('/', 'na', 'NA', 'N/A', 'not applicable')
