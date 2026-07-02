# Part of Odoo. See LICENSE file for full copyright and licensing details.

# VeriFactu-specific additions to the shared l10n.es.vat.regime.mixin catalog
# (see l10n_es_vat_regime_mixin.py), taken from the official AEAT VeriFactu spec
# ("DsRegistroVeriFactu.xlsx", sheet "6)Listas", lists L8A [Impuesto=IVA] / L8B [Impuesto=IGIC]).
#
# All of these are exclusive to VeriFactu (per the AEAT ClaveRegimen legend, none of them are
# used by SII's/TBAI's classic catalogs): '18_*' (Recargo de equivalencia / pequeño empresario),
# '19_*' (REAGYP / exenciones art. 25), '20' (Régimen simplificado, no IGIC equivalent), '11_vf'
# and '17_igic' (VeriFactu's own meanings for numbers that mean something else in the shared core).
VERIFACTU_EXTRA_LABELS = {
    '11_vf': "11 - Arrendamiento de local de negocio",
    '17_igic': "17 - Régimen especial de comerciante minorista",
    '18_iva': "18 - Recargo de equivalencia",
    '18_igic': "18 - Régimen especial del pequeño empresario o profesional",
    '19_iva': "19 - REAGYP",
    '19_igic': "19 - Operaciones interiores exentas (art. 25 Ley 19/1994)",
    '20': "20 - Régimen simplificado",
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
