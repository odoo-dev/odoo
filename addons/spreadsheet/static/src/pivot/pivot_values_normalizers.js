import { registries, helpers, constants } from "@odoo/o-spreadsheet";

const { DEFAULT_LOCALE } = constants;
const { pivotNormalizationValueRegistry } = registries;
const { toString, toNumber, tryToNumber } = helpers;

/**
 * Add pivot normalizaton functions to support odoo specific fields
 * in spreadsheet
 */

pivotNormalizationValueRegistry
    .add("text", (value) => toString(value)) // ADRM TODO: custom groups with text/selection field
    .add("selection", (value) => toString(value))
    .add("monetary", (value) => toNumber(value, DEFAULT_LOCALE))
    .add("many2one", (value) => tryToNumber(value, DEFAULT_LOCALE) ?? value) // ADRM TODO: pas convaincu. Probablement juste pas normaliser custom fields ?
    .add("many2many", (value) => tryToNumber(value, DEFAULT_LOCALE) ?? value)
    .add("float", (value) => toNumber(value, DEFAULT_LOCALE));
