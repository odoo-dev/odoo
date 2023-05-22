/* @odoo-module */

import { markup, reactive } from "@odoo/owl";
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

class Reactive {
    constructor() {
        return reactive(this);
    }
}

export class DataPoint extends Reactive {
    /**
     * @param {import("./relational_model").RelationalModel} model
     * @param {import("./relational_model").Config"} config
     * @param {any} data
     * @param {Object} [options]
     */
    constructor(model, config, data, options) {
        super(...arguments);
        this.id = getId("datapoint");
        this.model = model;
        this.resModel = config.resModel; //FIXME We should transform this into a getter to avoid having to update it and to avoid modification
        this.context = config.context;
        this.fields = config.fields;
        this.activeFields = config.activeFields;
        this.fieldNames = Object.keys(this.activeFields);
        this._config = config;
        this.setup(config, data, options);
    }

    get config() {
        return this._config; //TODOPRO Remove this, it's only for dev purpose to see if the config is updated somewhere
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
            field = { type: "integer" }; //TODOPRO integer seems not be used in the switch case, why not return value directly ?
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
            case "properties": {
                return value
                    ? value.map((property) => ({
                          ...property,
                          value: this._parseServerValue(property, property.value ?? false),
                      }))
                    : [];
            }
        }
        return value;
    }
}
