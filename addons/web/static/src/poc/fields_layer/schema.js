/** @odoo-module **/

import { registry } from "@web/core/registry";
import { SchemaEntry } from "./schema_entry";

const schemaEntryRegistry = registry.category("schemaEntry");

export class Schema {
    constructor(params) {
        this.entries = {};
        this.data = params.data;
        this.readonly = params.readonly || false;

        const data = this.data;
        for (const [key, fieldInfo] of Object.entries(params.fieldsInfo)) {
            const value = data[fieldInfo.name];
            const entryClass = schemaEntryRegistry.get(fieldInfo.type, SchemaEntry);
            this.entries[key] = new entryClass({
                schema: this,
                fieldInfo,
                field: params.fields[fieldInfo.name],
                value,
                readonly: this.readonly,
            });
        }
    }

    evaluateContext() {
        return { ...this.data };
    }

    load() {
        return Promise.all(Object.values(this.entries).map((entry) => entry.load()));
    }
}
