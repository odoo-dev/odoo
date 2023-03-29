/* @odoo-module */

import { markup } from "@odoo/owl";
import { deserializeDate, deserializeDateTime } from "@web/core/l10n/dates";
import { evalDomain } from "@web/views/utils";
import { getId } from "./utils";

/**
 * @typedef Params
 * @property {string} resModel
 * @property {Object} context
 * @property {{[key: string]: FieldInfo}} activeFields
 * @property {{[key: string]: Field}} fields
 */

/**
 * @typedef Field
 * @property {string} name
 * @property {string} type
 * @property {[string,string][]} [selection]
 */

/**
 * @typedef FieldInfo
 * @property {string} context
 * @property {boolean} invisible
 * @property {boolean} readonly
 * @property {boolean} required
 * @property {boolean} onChange
 */

export class DataPoint {
    /**
     * @param {import("./relational_model").RelationalModel} model
     * @param {Params} params
     * @param {Object} [state={}]
     */
    constructor(model, params, state = {}) {
        this.id = getId("datapoint");
        this.model = model;
        this.resModel = params.resModel;
        this.context = params.context;
        /** @type {{[key: string]: Field}} */
        this.fields = {
            id: { name: "id", type: "integer", readonly: true },
            display_name: { name: "display_name", type: "char" },
            ...params.fields,
        };
        this.activeFields = params.activeFields;
        this.fieldNames = Object.keys(this.activeFields);
        this.setup(params, state);
    }

    // -------------------------------------------------------------------------
    // Public
    // -------------------------------------------------------------------------

    /**
     * @abstract
     * @param {Object} params
     * @param {Object} state
     */
    setup() {}

    // FIXME: not sure we want to keep this mecanism
    exportState() {}

    /**
     * FIXME: memoize this at some point?
     * @param {string} fieldName
     * @returns {boolean}
     */
    isFieldReadonly(fieldName) {
        const activeField = this.activeFields[fieldName];
        // FIXME: if modifiers has readonly or not ?
        const { readonly } = activeField || this.fields[fieldName];
        return readonly && evalDomain(readonly, this.evalContext);
    }

    // -------------------------------------------------------------------------
    // Protected
    // -------------------------------------------------------------------------

    /**
     * @param {Field | false} field
     * @param {any} value
     * @returns {any}
     */
    _parseServerValue(field, value) {
        if (!field) {
            field = { type: "integer" };
        }
        switch (field.type) {
            case "char":
            case "text": {
                return value || "";
            }
            case "date": {
                return value ? deserializeDate(value) : false;
            }
            case "datetime": {
                return value ? deserializeDateTime(value) : false;
            }
            case "html": {
                return markup(value || "");
            }
            case "selection": {
                if (value === false) {
                    // process selection: convert false to 0, if 0 is a valid key
                    const hasKey0 = field.selection.find((option) => option[0] === 0);
                    return hasKey0 ? 0 : value;
                }
                return value;
            }
            case "many2one": {
                if (Array.isArray(value)) {
                    // for now, onchange still returns many2one values as pairs [id, display_name]
                    return value;
                }
                if (Number.isInteger(value)) {
                    // for always invisible many2ones, unity directly returns the id, not a pair
                    // FIXME: should return an object with only the id
                    return [value, ""];
                }
                return value ? [value.id, value.display_name] : false;
            }
        }
        return value;
    }
}
