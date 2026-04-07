import re

from stdnum import (
    ean,
    # gs1_128 as gs1,
    # iban,
    lei,
)

from stdnum.at import uid as at_en
from stdnum.au import acn as au_acn
from stdnum.be import vat as be_vat
from stdnum.ch import uid as ch_uid
# from stdnum.de import leitweg as de_leitweg FIXME should upgrade stdnum to 2.1
from stdnum.dk import cvr as dk_cvr
from stdnum.ee import registrikood as ee_en
from stdnum.eu import vat as eu_vat
from stdnum.fi import ytunnus as fi_en
from stdnum.fr import nir as fr_cn, siret as fr_siret, siren as fr_siren
from stdnum.it import codicefiscale as it_codice
from stdnum.jp import cn as jp_en
from stdnum.lv import pvn as lv_en
from stdnum.ma import ice as ma_ice
from stdnum.no import orgnr as no_en
from stdnum.se import orgnr as se_en
from stdnum.sg import uen as sg_en

from odoo.tools.translate import LazyTranslate
from odoo.exceptions import ValidationError

from odoo.addons.account.tools.partner_identifier_validation import nl_kvk_validate, nl_oin_validate

_lt = LazyTranslate(__name__)

# -------------------------------------------------------------------------
# DOCUMENTATION:
# - https://docs.peppol.eu/poacc/billing/3.0/codelist/eas/
# -------------------------------------------------------------------------

    # 'FI': {'0216': None},
    # 'AX': {'0216': None},  # Åland Islands
    # 'HR': {'9934': 'vat', '0088': 'company_registry'},


# TODO check all TIN category
# Notes:
# EAS_MAPPING -> 'HR': {'0088': 'company_registry'}, that's GLN ! Same for NZ.

# FIXME could we use this? No env...
# dom_tom_country_group = env.ref('base.dom-tom', raise_if_not_found=False)
# dom_tom_codes = dom_tom_country_group and dom_tom_country_group.country_ids.mapped('code')
# return ["FR"] + (dom_tom_codes or [])
FR_AND_DOM_TOM = [
    'FR', 'BL', 'GF', 'GP', 'MF', 'MQ', 'NC', 'PF', 'PM', 'RE', 'TF', 'WF', 'YT',
]

# FIXME return env.ref('base.sepa_zone', raise_if_not_found=False).country_ids.mapped('code')
SEPA_COUNTRIES = [
    'AD', 'AT', 'AX', 'BE', 'BG', 'BL', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR',
    'UK', 'GF', 'GG', 'GI', 'GP', 'GR', 'HR', 'HU', 'IE', 'IM', 'IS', 'IT', 'JE', 'LI', 'LT',
    'LU', 'LV', 'MC', 'MF', 'MQ', 'MT', 'NL', 'NO', 'PL', 'PM', 'PT', 'RE', 'RO', 'SE', 'SI',
    'SK', 'SM', 'VA', 'YT',
]

GLN_SHARED_VALS = {
    'placeholder': '9780471117094',
    'validation_function': ean.validate,

}
SHADOWS_GLN = ['HR_EN', 'HU_EN', 'NZ_EN']

TIN_CATEGORIES = ['TIN', 'VAT', 'GST']

IDENTIFIERS_METADATA = {
    'AD_VAT': {  # NRT
        # https://www.oecd.org/tax/automatic-exchange/crs-implementation-and-assistance/tax-identification-numbers/Andorra-TIN.pdf
        'iso6523': '9922',
        'placeholder': 'U132950X',
        'category': 'VAT',
        'countries': ['AD'],
    },
    'AE_TIN': {
        'iso6523': '0235',
        'category': 'TIN',
        'countries': ['AE'],
    },
    'AL_TIN': {  # NIPT
        'iso6523': '9923',
        'placeholder': 'ALJ91402501L',
        'category': 'TIN',
        'countries': ['AL'],
    },
    'AR_CUIT': {
        'placeholder': '20055361682',
        'category': 'TIN',
        'countries': ['AR'],
    },
    'AT_EN': {
        # Almost equivalent to 9914, but without "AT" prefix ?
        'sequence': 10,
        'iso6523': '9915',
        'label': _lt('Company registry'),
        'category': 'EN',
        'validation_function': at_en.validate,
        'countries': ['AT'],
    },
    'AT_VAT': {
        'iso6523': '9914',
        'placeholder': 'ATU12345675',
        'category': 'VAT',
        'countries': ['AT'],
    },
    'AU_ACN': {
        'sequence': 10,
        'label': _lt('ACN'),
        'placeholder': '004085616',
        'category': 'EN',
        'validation_function': au_acn.validate,
        'countries': ['AU'],
    },
    'AU_ABN': {  # FIXME check if Odoo can validate it correctly else -> stdnum.au.abn.validate
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
    'BE_CN': {
        'sequence': 20,
        'iso6523': '0008',
        'label': _lt('Citizen Identification'),
        'placeholder': '12.34.55-555.6',
        # 'validation_function': be_cn.validate,  FIXME should upgrade stdnum to 2.1
        'countries': ['BE'],
    },
    'BE_EN': {
        'sequence': 10,
        'iso6523': '0208',
        'label': _lt('BCE/KBO'),
        'placeholder': '0477472701',
        'category': 'EN',
        'validation_function': be_vat.validate,
        'examples': ['0477472701', '1477472701'],
        'countries': ['BE'],
    },
    'BE_VAT': {
        'iso6523': '9925',
        'placeholder': 'BE0477472701',
        'category': 'VAT',
        'countries': ['BE'],
    },
    'BG_VAT': {
        'iso6523': '9926',
        'placeholder': 'BG1234567892',
        'category': 'VAT',
        'countries': ['BG'],
    },
    'BR_TIN': {  # FIXME that's 2 in 1... probably not well handled in validation
        'placeholder': _lt('either 11 digits for CPF or 14 digits for CNPJ'),
        'category': 'TIN',
        'countries': ['BR'],
    },
    'CH_EN': {
        'sequence': 10,
        'iso6523': '0183',
        'label': _lt('Swiss Unique Business Identification Number (UIDB)'),
        'placeholder': 'CHE-100.155.212',
        'category': 'EN',
        'validation_function': ch_uid.validate,
        'countries': ['CH'],
    },
    'CH_VAT': {
        'iso6523': '9927',
        'placeholder': _lt('CHE-123.456.788 TVA or CHE-123.456.788 MWST or CHE-123.456.788 IVA'),
        'category': 'VAT',
        'countries': ['CH'],
    },
    'CL_RUT': {  # FIXME probably not validated ? -> stdnum.cl.rut
        'placeholder': '76086428-5',
        'category': 'TIN',
        'countries': ['CL'],
    },
    'CO_NIT': {  # FIXME probably not validated ? -> stdnum.co.nit
        'placeholder': '213123432-1',
        'category': 'TIN',
        'countries': ['CO'],
    },
    'CR_CPJ': {  # FIXME probably not validated ? -> stdnum.cr.cpj
        'placeholder': '3101012009',
        'category': 'TIN',
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
    'DE_GEBA': {
        'sequence': 10,
        'iso6523': '0246',
        'label': _lt('German Electronic Business Address'),
        'placeholder': '',
        'countries': ['DE'],
    },
    'DE_LTW': {
        # EDI specific to invoice to government
        'sequence': 200,
        'iso6523': '0204',
        'label': _lt('Germany Leitweg-ID'),
        'placeholder': '991-03730-19',
        # 'validation_function': de_leitweg.validate,  FIXME should upgrade stdnum to 2.1
        'countries': ['DE'],
    },
    'DE_VAT': {
        'iso6523': '9930',
        'placeholder': _lt('DE123456788 or 12/345/67890'),
        'category': 'VAT',
        'countries': ['DE'],
    },
    'DK_CVR': {
        # All companies have a CVR number, prefixed or not with "DK".
        # Refers to the legal entity.
        'sequence': 10,
        'iso6523': '0184',
        'label': _lt('CVR'),
        'placeholder': '58403288',
        'category': 'EN',
        'validation_function': dk_cvr.validate,
        'countries': ['DK'],
    },
    'DK_SE': {
        # A company might have multiple SE number for each department, prefixed or not with "DK".
        # Can be used in a VAT context if prefixed with "DK".
        # Refers to the tax entity.
        'sequence': 20,
        'iso6523': '0198',
        'label': _lt('SE'),
        'countries': ['DK'],
    },
    'DK_VAT': {
        # Same number as the CVR, but always prefixed.
        'placeholder': 'DK12345674',
        'category': 'VAT',
        'countries': ['DK'],
    },
    'DO_RNC': {  # FIXME stdnum.do.rnc
        'placeholder': _lt('1-01-85004-3 or 101850043'),
        'category': 'TIN',
        'countries': ['DO'],
    },
    'EC_RUC': {  # FIXME stdnum.ec.ruc
        'placeholder': _lt('1792060346001 or 1792060346'),
        'category': 'TIN',
        'countries': ['EC'],
    },
    'EE_EN': {
        'sequence': 10,
        'iso6523': '0191',
        'label': _lt('Registrikood'),
        'placeholder': '12345678',
        'category': 'EN',
        'validation_function': ee_en.validate,
        'countries': ['EE'],
    },
    'EE_VAT': {  # KMKR
        'iso6523': '9931',
        'placeholder': 'EE123456780',
        'category': 'VAT',
        'countries': ['EE'],
    },
    'ES_VAT': {  # NIF
        'iso6523': '9920',
        'placeholder': 'ESA12345674',
        'category': 'VAT',
        'countries': ['ES'],
    },
    'FI_EN': {  # Y-tunnus
        'sequence': 10,
        'iso6523': '0216',
        'label': _lt('Business ID'),
        'placeholder': '8763054-9',
        'category': 'EN',
        'validation_function': fi_en.validate,
        'countries': ['FI'],
    },
    'FI_VAT': {
        'iso6523': '0213',
        'placeholder': 'FI12345671',
        'category': 'VAT',
        'countries': ['FI'],
    },
    'FR_CN': {
        'sequence': 200,
        'iso6523': '0240',
        'label': _lt('France Register of legal persons'),
        'placeholder': '295109912611193',
        'validation_function': fr_cn.validate,
        'countries': FR_AND_DOM_TOM,
    },
    'FR_CTC': {
        # EDI specific - French PDP/AP
        'sequence': 30,
        'iso6523': '0225',
        'label': _lt('France FRCTC Electronic Address'),
        'countries': FR_AND_DOM_TOM,
    },
    'FR_SIREN': {
        'sequence': 20,
        'iso6523': '0002',
        'label': _lt('SIREN'),
        'placeholder': '552008443',
        'category': 'EN',
        'validation_function': fr_siren.validate,
        'countries': FR_AND_DOM_TOM,
    },
    'FR_SIRET': {
        'sequence': 10,
        'iso6523': '0009',
        'label': _lt('SIRET'),
        'placeholder': '33417522101010',
        'category': 'EN',
        'validation_function': fr_siret.validate,
        'countries': FR_AND_DOM_TOM,
    },
    'FR_VAT': {
        'iso6523': '9957',
        'placeholder': 'FR23334175221',
        'category': 'VAT',
        'countries': FR_AND_DOM_TOM,
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
    'GT_NIT': {  # FIXME stdnum.gt.nit
        'placeholder': '576937K',
        'category': 'TIN',
        'countries': ['GT'],
    },
    'HR_EN': {
        **GLN_SHARED_VALS,
        'sequence': 10,
        'label': _lt('Company Registry'),
        'category': 'EN',
        'countries': ['HR'],
    },
    'HR_VAT': {
        'iso6523': '9934',
        'placeholder': 'HR01234567896',
        'category': 'VAT',
        'countries': ['HR'],
    },
    'HU_EN': {
        **GLN_SHARED_VALS,
        'sequence': 10,
        'label': _lt('Company Registry'),
        'placeholder': _lt('12345678-1-11 or 8071592153'),
        'category': 'EN',
        'countries': ['HU'],
    },
    'HU_VAT': {  # That's the prefixed with HU VAT - the "EU" version
        'iso6523': '9910',
        'placeholder': 'HU12345676',
        'category': 'VAT',
        'countries': ['HU'],
    },
    'ID_TIN': {  # FIXME stdnum.id.npwp
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
    'IN_GST': {  # FIXME stdnum.in_.gstin
        'placeholder': '12AAAAA1234AAZA',
        'category': 'GST',
        'countries': ['IN'],
    },
    'IS_VAT': {  # FIXME stdnum.is_.vsk
        'iso6523': '0196',
        'placeholder': 'IS062199',
        'category': 'VAT',
        'countries': ['IS'],
    },
    'IT_CODICE': {
        'sequence': 10,
        'iso6523': '0210',
        'label': _lt('Codice Fiscale'),
        'placeholder': '00743110157',
        'category': 'EN',
        'validation_function': it_codice.validate,
        'countries': ['IT'],
    },
    'IT_VAT': {
        'iso6523': '0211',
        'label': _lt('IVA'),
        'placeholder': 'IT12345670017',
        'category': 'VAT',
        'countries': ['IT'],
    },
    'JP_EN': {
        'sequence': 10,
        'iso6523': '0188',
        'label': _lt('SST'),
        'placeholder': '7000012050002',
        'category': 'EN',
        'validation_function': jp_en.validate,
        'countries': ['JP'],
    },
    'JP_TIN': {
        'iso6523': '0221',
        'label': _lt('IIN'),
        'placeholder': 'T7000012050002',
        'category': 'TIN',
        'countries': ['JP'],
    },
    'KR_TIN': {  # FIXME stdnum.kr.brn
        'placeholder': _lt('123-45-67890 or 1234567890'),
        'category': 'TIN',
        'countries': ['KR'],
    },
    'LEI': {
        'sequence': 100,
        'iso6523': '0199',
        'label': _lt('Legal Entity Identifier (LEI)'),
        'placeholder': '213800KUD8LAJWSQ9D15',
        'validation_function': lei.validate,
        'countries': SEPA_COUNTRIES,
    },
    'LI_VAT': {
        'iso6523': '9936',
        'category': 'VAT',
        'countries': ['LI'],
    },
    'LT_JAK': {
        'sequence': 10,
        'iso6523': '0200',
        'label': _lt('Company registry'),
        'category': 'EN',
        'countries': ['LT'],
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
    'LV_EN': {
        'sequence': 10,
        'iso6523': '0218',
        'label': _lt('Company registry'),
        'placeholder': '40003521600',
        'category': 'EN',
        'validation_function': lv_en.validate,
        'countries': ['LV'],
    },
    'LV_VAT': {
        'iso6523': '9939',
        'placeholder': 'LV41234567891',
        'category': 'VAT',
        'countries': ['LV'],
    },
    'MA_ICE': {
        'sequence': 10,
        'label': _lt('ICE'),
        'placeholder': '001561191000066',
        'category': 'EN',
        'validation_function': ma_ice.validate,
        'countries': ['MA'],
    },
    'MA_TIN': {
        'placeholder': '12345678',
        'category': 'TIN',
        'countries': ['MA'],
    },
    'MC_VAT': {  # FIXME stdnum.mc.tva
        'iso6523': '9940',
        'placeholder': 'FR53000004605',
        'category': 'VAT',
        'countries': ['MC'],
    },
    'ME_VAT': {
        'iso6523': '9941',
        'placeholder': '02655284',
        'category': 'VAT',
        'countries': ['ME'],
    },
    'MK_VAT': {  # FIXME stdnum.mk.edb
        'iso6523': '9942',
        'placeholder': 'MK4057009501106',
        'category': 'VAT',
        'countries': ['MK'],
    },
    'MT_VAT': {
        'iso6523': '9943',
        'placeholder': 'MT12345634',
        'category': 'VAT',
        'countries': ['MT'],
    },
    'MX_RFC': {  # FIXME stdnum.mx.rfc
        'placeholder': 'GODE561231GR8',
        'category': 'TIN',
        'countries': ['MX'],
    },
    'MY_EN': {
        'sequence': 10,
        'iso6523': '0230',
        'label': _lt('Company registry'),
        'category': 'EN',
        'countries': ['MY'],
    },
    'NG_VAT': {
        'iso6523': '0244',
        'category': 'VAT',
        'countries': ['NG'],
    },
    'NL_KVK': {
        'sequence': 10,
        'iso6523': '0106',
        'label': _lt('KVK'),
        'placeholder': '12345678',
        'category': 'EN',
        'validation_function': nl_kvk_validate,
        'countries': ['NL'],
    },
    'NL_OIN': {
        'sequence': 20,
        'iso6523': '0190',
        'label': _lt('OIN'),
        'placeholder': '00000003123456780000',
        'category': 'EN',
        'validation_function': nl_oin_validate,
        'countries': ['NL'],
    },
    'NL_VAT': {
        'iso6523': '9944',
        'placeholder': 'NL123456782B90',
        'category': 'VAT',
        'countries': ['NL'],
    },
    'NO_EN': {
        'sequence': 10,
        'iso6523': '0192',
        'label': _lt('Register of Legal Entities (Brønnøysund Register Center)'),
        'placeholder': '974 760 673',
        'category': 'EN',
        'validation_function': no_en.validate,
        'countries': ['NO'],
    },
    'NO_VAT': {
        'placeholder': 'NO123456785',
        'category': 'VAT',
        'countries': ['NO'],
    },
    'NZ_EN': {
        **GLN_SHARED_VALS,
        'sequence': 10,
        'label': _lt('NZBN'),
        'category': 'EN',
        'countries': ['NZ'],
    },
    'NZ_GST': {
        'placeholder': _lt('49-098-576 or 49098576'),
        'category': 'GST',
        'countries': ['NZ'],
    },
    'PE_CUI': {  # CUI <-> RUT : to_ruc/to_dni
        'sequence': 10,
        'label': _lt('Company registry'),
        'placeholder': '101174102',
        'countries': ['PE'],
    },
    'PE_RUC': {  # FIXME stdnum.pe.ruc
        'placeholder': _lt('10XXXXXXXXY or 20XXXXXXXXY or 15XXXXXXXXY or 16XXXXXXXXY or 17XXXXXXXXY'),
        'category': 'TIN',
        'countries': ['PE'],
    },
    'PH_TIN': {
        'placeholder': '123-456-789-123',
        'category': 'TIN',
        'countries': ['PH'],
    },
    'PL_VAT': {  # NIP
        'iso6523': '9945',
        'placeholder': 'PL1234567883',
        'category': 'VAT',
        'countries': ['PL'],
    },
    'PT_VAT': {  # NIF
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
    'SA_GST': {
        'placeholder': _lt('310175397400003 [Fifteen digits, first and last digits should be "3"]'),
        'category': 'GST',
        'countries': ['SA'],
    },
    'SE_EN': {
        'sequence': 10,
        'iso6523': '0007',
        'label': _lt('Company registry'),
        'placeholder': '1234567897',
        'category': 'EN',
        'validation_function': se_en.validate,
        'countries': ['SE'],
    },
    'SE_VAT': {
        'iso6523': '9955',
        'placeholder': 'SE123456789701',
        'category': 'VAT',
        'countries': ['SE'],
    },
    'SG_EN': {
        'sequence': 10,
        'iso6523': '0195',
        'label': _lt('UEN'),
        'placeholder': '00192200M',
        'category': 'EN',
        'validation_function': sg_en.validate,
        'countries': ['SG'],
    },
    'SI_VAT': {
        'iso6523': '9949',
        'placeholder': 'SI12345679',
        'category': 'VAT',
        'countries': ['SI'],
    },
    'SK_EN': {
        'sequence': 10,
        'iso6523': '0245',
        'label': _lt('Company registry'),
        'category': 'EN',
        'countries': ['SK'],
    },
    'SK_VAT': {
        'iso6523': '9950',
        'placeholder': 'SK2022749619',
        'category': 'VAT',
        'countries': ['SK'],
    },
    'SM_VAT': {  # FIXME stdnum.sm.coe
        'iso6523': '9951',
        'placeholder': 'SM24165',
        'category': 'VAT',
        'countries': ['SM'],
    },
    'TH_VAT': {  # FIXME stdnum.th.tin
        'placeholder': '1234545678781',
        'category': 'VAT',
        'countries': ['TH'],
    },
    'TR_VAT': {  # FIXME stdnum.tr.vkn
        'iso6523': '9952',
        'placeholder': _lt('11111111111 (NIN) or 2222222222 (VKN)'),
        'category': 'VAT',
        'countries': ['TR'],
    },
    'UA_TIN': {  # stdnum.ua.rntrc
        'placeholder': _lt("12345678 or UA12345678 (EDRPOU), 1234567890 (RNOPP) or 123456789012 (IPN)"),
        'category': 'TIN',
        'countries': ['UA'],
    },
    'US_TIN': {  # FIXME stdnum.us.tin - guess_type
        'iso6523': '9959',
        'placeholder': '123-45-6789',
        'category': 'TIN',
        'countries': ['US'],
    },
    'UY_RUT': {  # FIXME stdnum.uy.rut
        'placeholder': _lt("211003420017"),
        'category': 'TIN',
        'countries': ['UY'],
    },
    'VA_VAT': {
        'iso6523': '9953',
        'category': 'VAT',
        'countries': ['VA'],
    },
    'VE_RIF': {  # FIXME stdnum.ve.rif
        'placeholder': 'V-12345678-1, V123456781, V-12.345.678-1',
        'category': 'TIN',
        'countries': ['VE'],
    },
    'XI_TIN': {
        'placeholder': 'XI123456782',
        'category': 'TIN',
        'countries': ['XI'],
    },
    # Keep international identifiers at the end of the dict
    'DUNS': {
        'sequence': 100,
        'iso6523': '0060',
        'label': _lt('DUNS'),
        'placeholder': '372441183',
        'countries': False,
    },
    'EAN_GLN': {
        **GLN_SHARED_VALS,
        'sequence': 100,
        'iso6523': '0088',
        'label': _lt('EAN/GLN'),
        'countries': False,
    },
    'GS1': {
        'sequence': 200,
        'iso6523': '0209',
        'label': _lt('GS1 identification keys'),
        # 'validation_function': gs1.validate,
        'countries': False,
    },
    'IBAN': {
        # EDI specific don't mix up with account_number
        'sequence': 200,
        'iso6523': '9918',
        'label': _lt('IBAN'),
        # 'validation_function': iban.validate,
        'countries': False,
    },
}

TIN_METADATA = {
    key: metadata for key, metadata
    in IDENTIFIERS_METADATA.items()
    if metadata.get('category') in TIN_CATEGORIES
}

ADDITIONAL_IDENTIFIERS_METADATA = {
    key: metadata for key, metadata
    in IDENTIFIERS_METADATA.items()
    if metadata.get('category') not in TIN_CATEGORIES
}

ISO_IDENTIFIERS_METADATA = {
    metadata.get('iso6523'): {'key': key, **metadata}
    for key, metadata in IDENTIFIERS_METADATA.items()
    if metadata.get('iso6523')
}

    # FIXME Can't be registered on Peppol - not sure what to do with it. check with TSB
    # ('AN', "O.F.T.P. (ODETTE File Transfer Protocol)"),
    # ('AQ', "X.400 address for mail text"),
    # ('AS', "AS2 exchange"),
    # ('AU', "File Transfer Protocol"),
    # ('EM', "Electronic mail"),

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

def normalize_identifier(identifier_type, value):
    value = value if not is_identifier_void(value) else None
    if not value:
        return value
    return value.strip()


def validate_identifier(identifier_type, value):
    value = normalize_identifier(identifier_type, value)
    if not value:
        return {'valid': False, 'value': value, 'example': None}

    metadata = get_identifier_metadata(identifier_type)
    example = metadata.get('examples') or metadata.get('placeholder')
    function_validation = metadata.get('validation_function')
    if not function_validation and metadata.get('category') == 'VAT':
        function_validation = eu_vat.validate
    if function_validation:
        try:
            value_normalized = function_validation(value)
        except:
            return {'valid': False, 'value': value, 'example': example}
        else:
            return {'valid': True, 'value': value_normalized, 'example': example}
    return {'valid': True, 'value': value, 'example': example}

def format_participant_identifier(identifier_type, value):
    if eas := get_identifier_metadata(identifier_type).get('iso6523'):
        return f'{eas}:{value}'
    return None

def validate_participant_identifier(identifier):
    assert ':' in identifier
    iso_scheme, _sep, value = identifier.partition(':')
    identifier = ISO_IDENTIFIERS_METADATA[iso_scheme]
    validation = validate_identifier(identifier['key'], value)
    validation['value'] = f'{iso_scheme}:{validation['value']}'
    return validation


ENDPOINT_INVALIDCHARS_RE = re.compile(r'[^a-zA-Z\d\-._~]')
ENDPOINT_INVALID_CHARS_RE_BY_EAS = {
    '0208': re.compile(r'[^0-9]'),
    '9925': re.compile(r'[^beBE0-9]'),
}

def sanitize_endpoint(value, eas=None):
    if not value:
        return value
    sanitizer = ENDPOINT_INVALID_CHARS_RE_BY_EAS.get(eas, ENDPOINT_INVALIDCHARS_RE)
    return sanitizer.sub('', value)


def validation_error_message(env, identifier_type, example=None):
    example = env._("\nExample: %s", example) if example else ""
    return env._(
        "Invalid identifier: %s.%s",
        get_identifier_metadata(identifier_type)['label'],
        example
    )
