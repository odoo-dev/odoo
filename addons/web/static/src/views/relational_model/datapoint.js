/* @odoo-module */

import { reactive } from "@odoo/owl";
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
        return this._config; //FIXME Remove this, it's only for dev purpose to see if the config is updated somewhere
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

    /**
     * @param {string} fieldName
     * @returns {boolean}
     */
    isFieldReadonly(fieldName) {
        const activeField = this.activeFields[fieldName];
        const { readonly } = activeField || this.fields[fieldName];
        return readonly && evalDomain(readonly, this.evalContext);
    }
}
