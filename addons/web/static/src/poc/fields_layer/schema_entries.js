/** @odoo-module **/

import { registry } from "@web/core/registry";
import { SchemaEntry } from "./schema_entry";

const schemaEntryRegistry = registry.category("schemaEntry");

class SelectionSchemaEntry extends SchemaEntry {
    setup() {
        this.options = [];
    }

    async load() {
        switch (this.field.type) {
            case "many2one": {
                break;
            }
            case "selection": {
                this.options = this.field.options;
                break;
            }
        }
    }

    computeProps() {
        return {
            ...super.computeProps(),
            options: this.options,
        };
    }
}

schemaEntryRegistry.add("selection", SelectionSchemaEntry);
