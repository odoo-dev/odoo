/** @odoo-module **/

import { registry } from "@web/core/registry";

const fieldsArchParserRegistry = registry.category("fieldsArchParser");

fieldsArchParserRegistry.add("char", (attrs) => ({
    placeholder: attrs.placeholder,
}));

fieldsArchParserRegistry.add("integer", (attrs) => ({
    placeholder: attrs.placeholder,
}));
