import { WithLazyGetterTrap } from "@point_of_sale/lazy_getter";
import { deepImmutable, clone, RAW_SYMBOL } from "./utils";
import { defineStateSetterTrap } from "./model_state";

import { toRaw } from "@odoo/owl";
const { DateTime } = luxon;

export class Base extends WithLazyGetterTrap {
    static excludedLazyGetters = ["id", "models"];

    constructor({ model, raw }) {
        super({ traps: { set: defineStateSetterTrap() } });
        this.model = model;
        this[RAW_SYMBOL] = raw;
    }

    get models() {
        return this.model.models;
    }

    get id() {
        return this[RAW_SYMBOL].id;
    }

    get raw() {
        return deepImmutable(clone(this[RAW_SYMBOL]), "Raw data cannot be modified");
    }

    /**
     * Called during instantiation when the instance is fully-populated with field values.
     * This method is called when the instance is created or updated
     * @param {*} _vals
     */
    setup(_vals) {}

    /**
     *  This method is invoked only during instance creation to preserve the state across updates.
     */
    initState() {}

    formatDateOrTime(field, type = "datetime") {
        if (type === "date") {
            return this[field].toLocaleString(DateTime.DATE_SHORT);
        }
        return this[field].toLocaleString(DateTime.DATETIME_SHORT);
    }

    isEqual(other) {
        return toRaw(this) === toRaw(other);
    }

    update(vals, opts = {}) {
        return this.model.update(this, vals, opts);
    }

    delete(opts = {}) {
        return this.model.delete(this, opts);
    }

    serializeForORM() {
        return this.model.serializeForORM(this);
    }

    serializeForIndexedDB() {
        return this.model.serializeForIndexedDB(this);
    }

    isDirty() {
        return !!this._dirty;
    }

    backLink(link) {
        return this.model.backLink(this, link);
    }
}
