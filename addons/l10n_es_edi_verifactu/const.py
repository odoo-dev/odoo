# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo.tools.translate import LazyTranslate

_lt = LazyTranslate(__name__)

# VeriFactu-specific additions to the shared VAT regime catalog
# (see l10n_es/models/account_tax.py), taken from the official AEAT VeriFactu spec
# ("DsRegistroVeriFactu.xlsx", sheet "6)Listas", lists L8A [Impuesto=IVA] / L8B [Impuesto=IGIC]).
#
# All of these are exclusive to VeriFactu (per the AEAT ClaveRegimen legend, none of them are
# used by SII's/TBAI's classic catalogs): '18_*' (Recargo de equivalencia / pequeño empresario),
# '19_*' (REAGYP / exenciones art. 25), '20' (Régimen simplificado, no IGIC equivalent), '11_vf'
# and '17_igic' (VeriFactu's own meanings for numbers that mean something else in the shared core).
VERIFACTU_EXTRA_LABELS = {
    '11_vf': _lt("11 - Business premises lease"),
    '17_igic': _lt("17 - Special regime for retail traders"),
    '18_iva': _lt("18 - Equivalence surcharge"),
    '18_igic': _lt("18 - Special regime for small businesses or professionals"),
    '19_iva': _lt("19 - REAGYP"),
    '19_igic': _lt("19 - Exempt domestic operations (Art. 25, Law 19/1994)"),
    '20': _lt("20 - Simplified regime"),
}

# Codes from the shared core that are also valid for VeriFactu, sale side only (VeriFactu never
# applies to purchases). Excludes '11', '12_sale', '13_sale' and '16' — those arrendamiento/DUA/
# transitional variants aren't part of either L8A or L8B; VeriFactu uses its own '11_vf' instead.
_VERIFACTU_SHARED_CODES = [
    '01', '02_sale', '03', '04', '05', '06', '07', '08', '09_sale', '10', '14_sale', '15',
]

# L8A: ClaveRegimen values valid when the tax applicability is IVA (or IPSI/"Other", which fall
# back to this list — the AEAT spec doesn't define a distinct list for those, see l10n_es_applicability).
VERIFACTU_REGIME_CODES_IVA = _VERIFACTU_SHARED_CODES + ['11_vf', '17', '18_iva', '19_iva', '20']

# L8B: ClaveRegimen values valid when the tax applicability is IGIC. No '20' equivalent exists.
VERIFACTU_REGIME_CODES_IGIC = _VERIFACTU_SHARED_CODES + ['11_vf', '17_igic', '18_igic', '19_igic']
